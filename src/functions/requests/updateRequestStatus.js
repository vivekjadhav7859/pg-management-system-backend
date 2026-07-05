const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const response = require('../../utils/response');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const VALID_STATUSES = ['approved', 'rejected', 'cancelled', 'in_progress', 'resolved', 'closed'];
const BED_ALLOCATION_ENTITY_TYPES = new Set(['bookingRequest', 'tenantJoinRequest']);
const RELEASE_STATUSES = new Set(['rejected', 'cancelled', 'closed']);
const RELEASED_ASSIGNMENT_STATUSES = new Set(['released', 'expired', 'cancelled']);
const LIVE_ASSIGNMENT_STATUSES = new Set(['assigned', 'reserved']);

function bedAssignmentId(roomId, bedNumber) {
    return `reservation#${roomId}#${String(bedNumber).trim()}`;
}

function shouldAllocateTenant(request) {
    if (request.entityType === 'tenantJoinRequest') return true;
    return request.entityType === 'bookingRequest' && request.requestType === 'booking';
}

async function isBlockingBedAssignment(assignment) {
    if (!assignment || RELEASED_ASSIGNMENT_STATUSES.has(assignment.status)) return false;
    if (!LIVE_ASSIGNMENT_STATUSES.has(assignment.status)) return true;
    if (!assignment.tenantId) return false;

    const tenant = await tenantService.getTenantById(assignment.tenantId);
    if (!tenant) return false;

    const sameBed =
        tenant.roomId === assignment.roomId &&
        String(tenant.bedNumber || '') === String(assignment.bedNumber || '');

    return sameBed && (
        ['active', 'in_progress'].includes(tenant.status) ||
        ['ongoing', 'onboarding'].includes(tenant.tenancyStatus)
    );
}

async function releaseStaleBedAssignment(assignment, timestamp) {
    if (!assignment?.assignmentId || !LIVE_ASSIGNMENT_STATUSES.has(assignment.status)) return;

    try {
        await dynamodb.update({
            TableName: process.env.BED_ASSIGNMENT_TABLE,
            Key: { assignmentId: assignment.assignmentId },
            UpdateExpression: 'SET #status = :released, releasedDate = :releasedDate, updatedAt = :updatedAt',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':released': 'released',
                ':releasedDate': timestamp,
                ':updatedAt': timestamp,
                ':assigned': 'assigned',
                ':reserved': 'reserved',
            },
            ConditionExpression: '#status IN (:assigned, :reserved)',
        }).promise();
    } catch (err) {
        if (err.code !== 'ConditionalCheckFailedException') throw err;
    }
}

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can update requests', 403);
        }

        const requestId = event.pathParameters?.requestId;
        const body = JSON.parse(event.body || '{}');
        const { status, notes, assignedVendor, finalSettlement, refundAmount, nocIssued, roomId, bedNumber } = body;

        if (!requestId || !VALID_STATUSES.includes(status)) {
            return response.error('Valid requestId and status are required', 400);
        }

        const existing = await dynamodb.get({
            TableName: process.env.NOTIFICATION_TABLE,
            Key: { id: requestId },
        }).promise();

        const request = existing.Item;
        if (!request) return response.error('Request not found', 404);
        if (request.userIdIndex !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('Unauthorized to update this request', 403);
        }

        const timestamp = new Date().toISOString();
        const baseUpdateExpression = [
            'SET requestStatus = :status',
            'updatedAt = :updatedAt',
            '#read = :read',
            'statusNotes = :notes',
            'assignedVendor = :assignedVendor',
            'finalSettlement = :finalSettlement',
            'refundAmount = :refundAmount',
            'nocIssued = :nocIssued',
        ];
        const baseExpressionAttributeNames = { '#read': 'read' };
        const baseExpressionAttributeValues = {
            ':status': status,
            ':updatedAt': timestamp,
            ':read': true,
            ':notes': notes || '',
            ':assignedVendor': assignedVendor || null,
            ':finalSettlement': finalSettlement || null,
            ':refundAmount': refundAmount !== undefined && refundAmount !== '' ? Number(refundAmount) : null,
            ':nocIssued': Boolean(nocIssued),
        };

        let updated;
        const shouldCreateTenantAssignment =
            status === 'approved' &&
            BED_ALLOCATION_ENTITY_TYPES.has(request.entityType) &&
            shouldAllocateTenant(request) &&
            request.requestStatus !== 'approved' &&
            !request.tenantId;
        const shouldReleaseBed =
            RELEASE_STATUSES.has(status) &&
            request.reservationAssignmentId &&
            !request.tenantId &&
            !RELEASE_STATUSES.has(request.requestStatus);

        if (shouldCreateTenantAssignment) {
            const selectedRoomId = roomId || request.roomId;
            const selectedBedNumber = String(bedNumber || '').trim();
            if (!selectedRoomId || !selectedBedNumber) {
                return response.error('Room and bed are required before approving this booking request', 400);
            }
            if (request.requestStatus !== 'pending') {
                return response.error('This request is no longer pending. Refresh requests and try again.', 409);
            }

            const [property, room] = await Promise.all([
                propertyService.getPropertyById(request.propertyIdIndex),
                propertyService.getRoomById(selectedRoomId),
            ]);

            if (!property) return response.error('Property not found', 404);
            if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
                return response.error('Unauthorized to reserve a bed for this property', 403);
            }
            if (!room || room.propertyId !== request.propertyIdIndex) {
                return response.error('Room not found for this request property', 404);
            }
            if ((room.availableBeds || 0) <= 0 || room.status === 'maintenance') {
                return response.error('Selected room is no longer available', 409);
            }

            const activeAssignments = await tenantService.getBedAssignmentsByRoom(selectedRoomId);
            const bedAssignments = activeAssignments.filter((assignment) => String(assignment.bedNumber) === selectedBedNumber);
            for (const assignment of bedAssignments) {
                const isBlocking = await isBlockingBedAssignment(assignment);
                if (isBlocking) {
                    return response.error(`Bed ${selectedBedNumber} is already assigned to an active tenant. Pick another bed.`, 409);
                }
                await releaseStaleBedAssignment(assignment, timestamp);
            }

            if (request.tenantUserId) {
                const existingTenant = await tenantService.getTenantByUserId(request.tenantUserId);
                if (existingTenant) {
                    return response.error('This tenant is already assigned to a property', 409);
                }
            }

            const tenantId = uuidv4();
            const assignmentId = bedAssignmentId(selectedRoomId, selectedBedNumber);
            const existingAssignment = await dynamodb.get({
                TableName: process.env.BED_ASSIGNMENT_TABLE,
                Key: { assignmentId },
            }).promise();
            if (existingAssignment.Item) {
                const isBlocking = await isBlockingBedAssignment(existingAssignment.Item);
                if (isBlocking) {
                    return response.error(`Bed ${selectedBedNumber} is already assigned to an active tenant. Pick another bed.`, 409);
                }
                await releaseStaleBedAssignment(existingAssignment.Item, timestamp);
            }

            const tenantName = request.tenantName || request.tenantEmail || 'Tenant';
            const tenantEmail = request.tenantEmail || '';
            const tenantPhone = request.tenantPhone || '';
            const tenantItem = {
                tenantId,
                userId: request.tenantUserId || `request-${requestId}`,
                propertyId: request.propertyIdIndex,
                roomId: selectedRoomId,
                bedNumber: selectedBedNumber,
                name: tenantName,
                email: tenantEmail,
                phone: tenantPhone,
                emergencyContact: {},
                kycDocuments: {},
                kycStatus: 'pending',
                checkInDate: timestamp.slice(0, 10),
                checkOutDate: null,
                rentAmount: Number(room.rentPerBed || 0),
                securityDeposit: Number(room.securityDeposit || 0),
                depositPaid: false,
                depositAmount: 0,
                depositDate: null,
                status: 'in_progress',
                tenancyStatus: 'onboarding',
                sourceRequestId: requestId,
                sourceRequestType: request.requestType || request.entityType,
                createdAt: timestamp,
                updatedAt: timestamp,
                propertyIdIndex: request.propertyIdIndex,
                roomIdIndex: selectedRoomId,
                userIdIndex: request.tenantUserId || `request-${requestId}`,
                statusIndex: 'in_progress',
            };

            baseUpdateExpression.push(
                'roomId = :roomId',
                'roomNumber = :roomNumber',
                'bedNumber = :bedNumber',
                'reservationAssignmentId = :reservationAssignmentId',
                'tenantId = :tenantId',
                'approvedAt = :approvedAt'
            );
            Object.assign(baseExpressionAttributeValues, {
                ':roomId': selectedRoomId,
                ':roomNumber': room.roomNumber,
                ':bedNumber': selectedBedNumber,
                ':reservationAssignmentId': assignmentId,
                ':tenantId': tenantId,
                ':approvedAt': timestamp,
                ':pending': 'pending',
            });

            await dynamodb.transactWrite({
                TransactItems: [
                    {
                        Update: {
                            TableName: process.env.NOTIFICATION_TABLE,
                            Key: { id: requestId },
                            UpdateExpression: baseUpdateExpression.join(', '),
                            ExpressionAttributeNames: baseExpressionAttributeNames,
                            ExpressionAttributeValues: baseExpressionAttributeValues,
                            ConditionExpression: 'requestStatus = :pending',
                        },
                    },
                    {
                        Put: {
                            TableName: process.env.TENANT_TABLE,
                            Item: tenantItem,
                            ConditionExpression: 'attribute_not_exists(tenantId)',
                        },
                    },
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
                                'requestId = :requestId',
                                'requestType = :requestType',
                                'createdAt = if_not_exists(createdAt, :createdAt)',
                                'updatedAt = :updatedAt',
                                'roomIdIndex = :roomId',
                                'tenantIdIndex = :tenantId',
                            ].join(', '),
                            ExpressionAttributeNames: { '#status': 'status' },
                            ExpressionAttributeValues: {
                                ':tenantId': tenantId,
                                ':propertyId': request.propertyIdIndex,
                                ':roomId': selectedRoomId,
                                ':bedNumber': selectedBedNumber,
                                ':assignedDate': timestamp,
                                ':releasedDate': null,
                                ':assigned': 'assigned',
                                ':released': 'released',
                                ':expired': 'expired',
                                ':cancelled': 'cancelled',
                                ':requestId': requestId,
                                ':requestType': request.requestType || request.entityType,
                                ':createdAt': timestamp,
                                ':updatedAt': timestamp,
                            },
                            ConditionExpression: 'attribute_not_exists(assignmentId) OR #status IN (:released, :expired, :cancelled)',
                        },
                    },
                    {
                        Update: {
                            TableName: process.env.ROOM_TABLE,
                            Key: { roomId: selectedRoomId },
                            UpdateExpression: 'SET availableBeds = availableBeds - :one, occupiedBeds = occupiedBeds + :one, updatedAt = :updatedAt',
                            ExpressionAttributeNames: { '#status': 'status' },
                            ExpressionAttributeValues: {
                                ':one': 1,
                                ':zero': 0,
                                ':updatedAt': timestamp,
                                ':maintenance': 'maintenance',
                            },
                            ConditionExpression: 'availableBeds > :zero AND #status <> :maintenance',
                        },
                    },
                    ...(request.tenantUserId ? [{
                        Update: {
                            TableName: process.env.USER_TABLE,
                            Key: { userId: request.tenantUserId },
                            UpdateExpression: 'SET linkedPropertyId = :propertyId, linkedOwnerId = :ownerId, updatedAt = :updatedAt',
                            ExpressionAttributeValues: {
                                ':propertyId': request.propertyIdIndex,
                                ':ownerId': property.ownerId,
                                ':updatedAt': timestamp,
                            },
                        },
                    }] : []),
                ],
            }).promise();

            try {
                const updatedRoom = await propertyService.getRoomById(selectedRoomId);
                if (updatedRoom && updatedRoom.availableBeds === 0) {
                    await propertyService.updateRoom(selectedRoomId, { status: 'occupied' });
                }
            } catch (statusErr) {
                console.warn('[updateRequestStatus] non-critical room status update failed', statusErr.message);
            }

            try {
                await dynamodb.update({
                    TableName: process.env.PROPERTY_TABLE,
                    Key: { propertyId: request.propertyIdIndex },
                    UpdateExpression: 'SET occupiedBeds = if_not_exists(occupiedBeds, :zero) + :one, availableBeds = availableBeds - :one, updatedAt = :updatedAt',
                    ExpressionAttributeValues: {
                        ':one': 1,
                        ':zero': 0,
                        ':updatedAt': timestamp,
                    },
                    ConditionExpression: 'availableBeds > :zero',
                }).promise();
            } catch (propertyCounterErr) {
                console.warn('[updateRequestStatus] non-critical property occupancy counter update failed', propertyCounterErr.message);
            }

            updated = await dynamodb.get({
                TableName: process.env.NOTIFICATION_TABLE,
                Key: { id: requestId },
            }).promise();
            updated = { Attributes: updated.Item };
        } else if (shouldReleaseBed) {
            await dynamodb.transactWrite({
                TransactItems: [
                    {
                        Update: {
                            TableName: process.env.NOTIFICATION_TABLE,
                            Key: { id: requestId },
                            UpdateExpression: baseUpdateExpression.join(', '),
                            ExpressionAttributeNames: baseExpressionAttributeNames,
                            ExpressionAttributeValues: baseExpressionAttributeValues,
                        },
                    },
                    {
                        Update: {
                            TableName: process.env.BED_ASSIGNMENT_TABLE,
                            Key: { assignmentId: request.reservationAssignmentId },
                            UpdateExpression: 'SET #status = :released, releasedDate = :releasedDate, updatedAt = :updatedAt',
                            ExpressionAttributeNames: { '#status': 'status' },
                            ExpressionAttributeValues: {
                                ':released': 'released',
                                ':releasedDate': timestamp,
                                ':updatedAt': timestamp,
                                ':reserved': 'reserved',
                                ':requestId': requestId,
                            },
                            ConditionExpression: '#status = :reserved AND requestId = :requestId',
                        },
                    },
                    {
                        Update: {
                            TableName: process.env.ROOM_TABLE,
                            Key: { roomId: request.roomId },
                            UpdateExpression: 'SET availableBeds = availableBeds + :one, reservedBeds = reservedBeds - :one, updatedAt = :updatedAt',
                            ExpressionAttributeValues: {
                                ':one': 1,
                                ':zero': 0,
                                ':updatedAt': timestamp,
                            },
                            ConditionExpression: 'reservedBeds > :zero',
                        },
                    },
                    {
                        Update: {
                            TableName: process.env.PROPERTY_TABLE,
                            Key: { propertyId: request.propertyIdIndex },
                            UpdateExpression: 'SET availableBeds = availableBeds + :one, reservedBeds = reservedBeds - :one, updatedAt = :updatedAt',
                            ExpressionAttributeValues: {
                                ':one': 1,
                                ':zero': 0,
                                ':updatedAt': timestamp,
                            },
                            ConditionExpression: 'reservedBeds > :zero',
                        },
                    },
                ],
            }).promise();

            updated = await dynamodb.get({
                TableName: process.env.NOTIFICATION_TABLE,
                Key: { id: requestId },
            }).promise();
            updated = { Attributes: updated.Item };
        } else {
            const update = {
                TableName: process.env.NOTIFICATION_TABLE,
                Key: { id: requestId },
                UpdateExpression: baseUpdateExpression.join(', '),
                ExpressionAttributeNames: baseExpressionAttributeNames,
                ExpressionAttributeValues: baseExpressionAttributeValues,
                ReturnValues: 'ALL_NEW',
            };

            updated = await dynamodb.update(update).promise();
        }

        if (request.tenantUserId) {
            await dynamodb.put({
                TableName: process.env.NOTIFICATION_TABLE,
                Item: {
                    id: uuidv4(),
                    userIdIndex: request.tenantUserId,
                    propertyIdIndex: request.propertyIdIndex,
                    type: 'Request Update',
                    title: `${request.title || 'Request'} ${status.replace(/_/g, ' ')}`,
                    description: notes || `Your request status is now ${status.replace(/_/g, ' ')}.`,
                    entityId: requestId,
                    entityType: request.entityType || 'request',
                    read: false,
                    requestStatus: status,
                    createdAt: timestamp,
                    createdAtIndex: timestamp,
                },
            }).promise();
        }

        return response.success({
            message: 'Request updated successfully',
            request: updated.Attributes,
        });
    } catch (err) {
        console.error('[updateRequestStatus]', err);
        if (err.code === 'TransactionCanceledException' || err.code === 'ConditionalCheckFailedException') {
            return response.error('Request update failed because the selected bed or request is no longer available. Refresh and try again.', 409);
        }
        return response.error('Failed to update request', 500);
    }
};
