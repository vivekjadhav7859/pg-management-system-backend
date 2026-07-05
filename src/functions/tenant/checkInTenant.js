const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const response = require('../../utils/response');
const { validateRequiredFields, sanitizeInput } = require('../../utils/validator');

const dynamodb = new AWS.DynamoDB.DocumentClient();

function bedAssignmentId(roomId, bedNumber) {
    return `reservation#${roomId}#${String(bedNumber).trim()}`;
}

exports.handler = async (event) => {
    try {
        console.log('Check-in tenant request received');

        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        // Only owners and admins can check-in tenants
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can check-in tenants', 403);
        }

        const body = JSON.parse(event.body);
        const { 
            userId, propertyId, roomId, bedNumber,
            name, email, phone, emergencyContact,
            checkInDate, rentAmount, securityDeposit,
            depositPaid, depositAmount, depositDate
        } = body;

        // Validate required fields
        const requiredValidation = validateRequiredFields(body, [
            'userId', 'propertyId', 'roomId', 'bedNumber',
            'name', 'email', 'phone', 'checkInDate',
            'rentAmount', 'securityDeposit'
        ]);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        // Verify property exists and belongs to owner
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only check-in tenants to your properties', 403);
        }

        // Verify room exists
        const room = await propertyService.getRoomById(roomId);
        if (!room) {
            return response.error('Room not found', 404);
        }

        if (room.propertyId !== propertyId) {
            return response.error('Room does not belong to this property', 400);
        }

        // Check if bed is available
        if (room.availableBeds <= 0) {
            return response.error('No beds available in this room', 400);
        }

        // Check if bed number is already assigned
        const existingAssignments = await tenantService.getBedAssignmentsByRoom(roomId);
        const bedTaken = existingAssignments.find(a => a.bedNumber === bedNumber);
        if (bedTaken) {
            return response.error(`Bed ${bedNumber} is already assigned`, 400);
        }

        // Check if user is already a tenant
        const existingTenant = await tenantService.getTenantByUserId(userId);
        if (existingTenant) {
            return response.error('User is already checked-in to a property', 400);
        }

        // ── Build all items for the atomic transaction ──
        const tenantId = uuidv4();
        const assignmentId = bedAssignmentId(roomId, bedNumber);
        const timestamp = new Date().toISOString();

        const tenantItem = {
            tenantId,
            userId,
            propertyId,
            roomId,
            bedNumber,
            name: sanitizeInput(name),
            email: sanitizeInput(email),
            phone: sanitizeInput(phone),
            emergencyContact: emergencyContact || {},
            kycDocuments: {},
            kycStatus: 'pending',
            checkInDate,
            checkOutDate: null,
            rentAmount,
            securityDeposit,
            depositPaid: depositPaid || false,
            depositAmount: depositAmount || 0,
            depositDate: depositDate || null,
            status: 'in_progress',
            tenancyStatus: 'onboarding',
            createdAt: timestamp,
            updatedAt: timestamp,
            // GSI attributes
            propertyIdIndex: propertyId,
            roomIdIndex: roomId,
            userIdIndex: userId,
            statusIndex: 'in_progress'
        };

        const assignmentItem = {
            assignmentId,
            tenantId,
            propertyId,
            roomId,
            bedNumber,
            assignedDate: checkInDate || timestamp,
            releasedDate: null,
            status: 'assigned',
            createdAt: timestamp,
            updatedAt: timestamp,
            // GSI attributes
            roomIdIndex: roomId,
            tenantIdIndex: tenantId
        };

        // ── Execute all 4 writes atomically via TransactWriteItems ──
        await dynamodb.transactWrite({
            TransactItems: [
                // 1. Create tenant record
                {
                    Put: {
                        TableName: process.env.TENANT_TABLE,
                        Item: tenantItem,
                        ConditionExpression: 'attribute_not_exists(tenantId)'
                    }
                },
                // 2. Create or claim the deterministic bed assignment record.
                // The assignment id is based on room+bed so concurrent attempts
                // for the same physical bed cannot both succeed.
                {
                    Update: {
                        TableName: process.env.BED_ASSIGNMENT_TABLE,
                        Key: { assignmentId },
                        UpdateExpression: [
                            'SET tenantId = :tenantId',
                            'propertyId = :propertyId',
                            'roomId = :roomId',
                            'bedNumber = :bedNumber',
                            'assignedDate = :assignedDate',
                            'releasedDate = :releasedDate',
                            '#status = :assigned',
                            'createdAt = if_not_exists(createdAt, :createdAt)',
                            'updatedAt = :updatedAt',
                            'roomIdIndex = :roomId',
                            'tenantIdIndex = :tenantId',
                        ].join(', '),
                        ExpressionAttributeNames: { '#status': 'status' },
                        ExpressionAttributeValues: {
                            ':tenantId': assignmentItem.tenantId,
                            ':propertyId': assignmentItem.propertyId,
                            ':roomId': assignmentItem.roomId,
                            ':bedNumber': assignmentItem.bedNumber,
                            ':assignedDate': assignmentItem.assignedDate,
                            ':releasedDate': null,
                            ':assigned': 'assigned',
                            ':released': 'released',
                            ':expired': 'expired',
                            ':cancelled': 'cancelled',
                            ':createdAt': timestamp,
                            ':updatedAt': timestamp,
                        },
                        ConditionExpression: 'attribute_not_exists(assignmentId) OR #status IN (:released, :expired, :cancelled)'
                    }
                },
                // 3. Update room occupancy (+1 occupied, -1 available)
                {
                    Update: {
                        TableName: process.env.ROOM_TABLE,
                        Key: { roomId },
                        UpdateExpression: 'SET occupiedBeds = occupiedBeds + :one, availableBeds = availableBeds - :one, updatedAt = :ts',
                        ExpressionAttributeValues: {
                            ':one': 1,
                            ':ts': timestamp,
                            ':zero': 0
                        },
                        ConditionExpression: 'availableBeds > :zero'
                    }
                },
                // 4. Update property occupancy (+1 occupied, -1 available)
                {
                    Update: {
                        TableName: process.env.PROPERTY_TABLE,
                        Key: { propertyId },
                        UpdateExpression: 'SET occupiedBeds = occupiedBeds + :one, availableBeds = availableBeds - :one, updatedAt = :ts',
                        ExpressionAttributeValues: {
                            ':one': 1,
                            ':ts': timestamp
                        }
                    }
                }
            ]
        }).promise();

        // Update room status if now fully occupied (non-critical, outside transaction)
        try {
            const updatedRoom = await propertyService.getRoomById(roomId);
            if (updatedRoom && updatedRoom.availableBeds === 0) {
                await propertyService.updateRoom(roomId, { status: 'occupied' });
            }
        } catch (statusErr) {
            console.warn('Non-critical: failed to update room status', statusErr.message);
        }

        // Auto-create pending rent record for the check-in month (non-critical, outside transaction)
        try {
            const financialService = require('../../services/financial.service');
            const checkInMonth = checkInDate ? checkInDate.slice(0, 7) : timestamp.slice(0, 7);
            
            await financialService.createRentPayment({
                tenantId: tenantId,
                propertyId: propertyId,
                roomId: roomId,
                amount: rentAmount,
                paymentMonth: checkInMonth,
                dueDate: checkInDate || timestamp.slice(0, 10),
                paymentStatus: 'pending',
                notes: 'Auto-generated rent record from check-in'
            });
            console.log('Pending rent record auto-created for tenant:', tenantId);
        } catch (rentErr) {
            console.warn('Non-critical: failed to auto-create rent record', rentErr.message);
        }

        console.log('Tenant checked-in successfully (atomic):', tenantId);

        return response.success({
            message: 'Tenant checked-in successfully',
            tenant: {
                tenantId: tenantItem.tenantId,
                userId: tenantItem.userId,
                propertyId: tenantItem.propertyId,
                roomId: tenantItem.roomId,
                bedNumber: tenantItem.bedNumber,
                name: tenantItem.name,
                email: tenantItem.email,
                phone: tenantItem.phone,
                checkInDate: tenantItem.checkInDate,
                rentAmount: tenantItem.rentAmount,
                securityDeposit: tenantItem.securityDeposit,
                status: tenantItem.status,
                createdAt: tenantItem.createdAt
            }
        }, 201);

    } catch (err) {
        console.error('Check-in tenant error:', err);

        // Handle TransactWriteItems-specific errors
        if (err.code === 'TransactionCanceledException') {
            const reasons = (err.CancellationReasons || [])
                .map((r, i) => r.Code !== 'None' ? `Step ${i + 1}: ${r.Code}` : null)
                .filter(Boolean);
            console.error('Transaction cancelled reasons:', reasons);
            return response.error(
                'Check-in failed due to a conflict — bed may have been taken. Please retry.',
                409
            );
        }

        return response.error('Failed to check-in tenant', 500);
    }
};
