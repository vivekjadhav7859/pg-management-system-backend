const AWS = require('aws-sdk');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const notificationService = require('../../services/notification.service');
const financialService = require('../../services/financial.service');
const response = require('../../utils/response');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');

const dynamodb = new AWS.DynamoDB.DocumentClient();

function bedAssignmentId(roomId, bedNumber) {
    return `reservation#${roomId}#${String(bedNumber).trim()}`;
}

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        console.log('Tenant room migration request received');

        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only property owners or admins can migrate tenants', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        const tenantId = event.pathParameters?.tenantId;
        if (!tenantId) {
            return response.error('Tenant ID is required in path parameters', 400);
        }

        const tenant = await tenantService.getTenantById(tenantId);
        if (!tenant) {
            return response.error('Tenant not found', 404);
        }

        if (tenant.status !== 'active' && tenant.status !== 'in_progress') {
            return response.error(`Cannot migrate tenant with status '${tenant.status}'`, 400);
        }

        // Verify ownership of tenant's current property
        const currentProperty = await propertyService.getPropertyById(tenant.propertyId);
        if (!currentProperty) {
            return response.error('Current property not found', 404);
        }
        if (currentProperty.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You do not have access to this property', 403);
        }

        const body = JSON.parse(event.body || '{}');
        const {
            targetPropertyId = tenant.propertyId,
            targetRoomId,
            targetBedNumber,
            effectiveDate = new Date().toISOString().slice(0, 10),
            newRentAmount,
            reason
        } = body;

        if (!targetRoomId || !targetBedNumber) {
            return response.error('targetRoomId and targetBedNumber are required', 400);
        }

        // Verify target property
        let targetProperty = currentProperty;
        if (targetPropertyId !== tenant.propertyId) {
            targetProperty = await propertyService.getPropertyById(targetPropertyId);
            if (!targetProperty) {
                return response.error('Target property not found', 404);
            }
            if (targetProperty.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
                return response.error('You do not have access to the target property', 403);
            }
        }

        // Prevent migration to exact same room and bed
        if (targetRoomId === tenant.roomId && String(targetBedNumber).trim() === String(tenant.bedNumber).trim()) {
            return response.error('Tenant is already assigned to this room and bed', 400);
        }

        // Verify source room exists
        const sourceRoom = await propertyService.getRoomById(tenant.roomId);
        if (!sourceRoom) {
            return response.error('Current room record not found', 404);
        }

        // Verify target room exists
        const targetRoom = await propertyService.getRoomById(targetRoomId);
        if (!targetRoom) {
            return response.error('Target room not found', 404);
        }
        if (targetRoom.propertyId !== targetPropertyId) {
            return response.error('Target room does not belong to the selected property', 400);
        }
        if (targetRoom.status === 'maintenance') {
            return response.error('Target room is under maintenance', 400);
        }

        // Verify target room capacity (unless moving within same room)
        if (targetRoomId !== tenant.roomId && targetRoom.availableBeds <= 0) {
            return response.error('Destination room has no available beds', 400);
        }

        // Check target bed availability
        const targetBedAssignments = await tenantService.getBedAssignmentsByRoom(targetRoomId);
        const bedTaken = targetBedAssignments.find(a => 
            String(a.bedNumber).trim() === String(targetBedNumber).trim() && 
            a.tenantId !== tenantId
        );
        if (bedTaken) {
            return response.error(`Bed ${targetBedNumber} in destination room is already occupied`, 400);
        }

        const timestamp = new Date().toISOString();
        const sourceAssignmentId = bedAssignmentId(tenant.roomId, tenant.bedNumber);
        const targetAssignmentId = bedAssignmentId(targetRoomId, targetBedNumber);
        const updatedRent = newRentAmount !== undefined && newRentAmount !== null ? Number(newRentAmount) : (tenant.rentAmount || targetRoom.rentPerBed);

        const isSameRoom = targetRoomId === tenant.roomId;
        const isSameProperty = targetPropertyId === tenant.propertyId;

        // Build TransactWriteItems
        const transactItems = [
            // 1. Update Tenant record with new room/bed/rent details
            {
                Update: {
                    TableName: process.env.TENANT_TABLE,
                    Key: { tenantId },
                    UpdateExpression: 'SET roomId = :targetRoomId, bedNumber = :targetBedNumber, propertyId = :targetPropertyId, rentAmount = :rentAmount, updatedAt = :ts, roomIdIndex = :targetRoomId, propertyIdIndex = :targetPropertyId',
                    ExpressionAttributeValues: {
                        ':targetRoomId': targetRoomId,
                        ':targetBedNumber': String(targetBedNumber).trim(),
                        ':targetPropertyId': targetPropertyId,
                        ':rentAmount': updatedRent,
                        ':ts': timestamp,
                        ':active': 'active',
                        ':inProgress': 'in_progress'
                    },
                    ExpressionAttributeNames: { '#status': 'status' },
                    ConditionExpression: 'attribute_exists(tenantId) AND #status IN (:active, :inProgress)'
                }
            },
            // 2. Release Old Bed Assignment (if changing room or bed)
            {
                Update: {
                    TableName: process.env.BED_ASSIGNMENT_TABLE,
                    Key: { assignmentId: sourceAssignmentId },
                    UpdateExpression: 'SET #status = :released, releasedDate = :ts, updatedAt = :ts',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':released': 'released',
                        ':ts': timestamp
                    }
                }
            },
            // 3. Assign New Bed Assignment
            {
                Update: {
                    TableName: process.env.BED_ASSIGNMENT_TABLE,
                    Key: { assignmentId: targetAssignmentId },
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
                        'tenantIdIndex = :tenantId'
                    ].join(', '),
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':tenantId': tenantId,
                        ':propertyId': targetPropertyId,
                        ':roomId': targetRoomId,
                        ':bedNumber': String(targetBedNumber).trim(),
                        ':assignedDate': effectiveDate || timestamp,
                        ':releasedDate': null,
                        ':assigned': 'assigned',
                        ':released': 'released',
                        ':expired': 'expired',
                        ':cancelled': 'cancelled',
                        ':createdAt': timestamp,
                        ':updatedAt': timestamp
                    },
                    ConditionExpression: 'attribute_not_exists(assignmentId) OR #status IN (:released, :expired, :cancelled) OR tenantId = :tenantId'
                }
            }
        ];

        // 4 & 5. Update room occupancies if changing rooms
        if (!isSameRoom) {
            transactItems.push(
                // Decrement Source Room
                {
                    Update: {
                        TableName: process.env.ROOM_TABLE,
                        Key: { roomId: tenant.roomId },
                        UpdateExpression: 'SET occupiedBeds = occupiedBeds - :one, availableBeds = availableBeds + :one, updatedAt = :ts',
                        ExpressionAttributeValues: {
                            ':one': 1,
                            ':ts': timestamp,
                            ':zero': 0
                        },
                        ConditionExpression: 'occupiedBeds > :zero'
                    }
                },
                // Increment Destination Room
                {
                    Update: {
                        TableName: process.env.ROOM_TABLE,
                        Key: { roomId: targetRoomId },
                        UpdateExpression: 'SET occupiedBeds = occupiedBeds + :one, availableBeds = availableBeds - :one, updatedAt = :ts',
                        ExpressionAttributeValues: {
                            ':one': 1,
                            ':ts': timestamp,
                            ':zero': 0
                        },
                        ConditionExpression: 'availableBeds > :zero'
                    }
                }
            );
        }

        // 6 & 7. Update property occupancies if changing properties
        if (!isSameProperty) {
            transactItems.push(
                // Decrement Source Property
                {
                    Update: {
                        TableName: process.env.PROPERTY_TABLE,
                        Key: { propertyId: tenant.propertyId },
                        UpdateExpression: 'SET occupiedBeds = occupiedBeds - :one, availableBeds = availableBeds + :one, updatedAt = :ts',
                        ExpressionAttributeValues: {
                            ':one': 1,
                            ':ts': timestamp
                        }
                    }
                },
                // Increment Target Property
                {
                    Update: {
                        TableName: process.env.PROPERTY_TABLE,
                        Key: { propertyId: targetPropertyId },
                        UpdateExpression: 'SET occupiedBeds = occupiedBeds + :one, availableBeds = availableBeds - :one, updatedAt = :ts',
                        ExpressionAttributeValues: {
                            ':one': 1,
                            ':ts': timestamp
                        }
                    }
                }
            );
        }

        // Execute atomic transaction
        await dynamodb.transactWrite({ TransactItems: transactItems }).promise();

        // ── Post-Transaction Actions (Non-critical) ──
        
        // 1. Update status on source & target rooms if fully occupied or newly available
        try {
            if (!isSameRoom) {
                const refreshedSource = await propertyService.getRoomById(tenant.roomId);
                if (refreshedSource && refreshedSource.status === 'occupied' && refreshedSource.availableBeds > 0) {
                    await propertyService.updateRoom(tenant.roomId, { status: 'available' });
                }

                const refreshedTarget = await propertyService.getRoomById(targetRoomId);
                if (refreshedTarget && refreshedTarget.availableBeds === 0) {
                    await propertyService.updateRoom(targetRoomId, { status: 'occupied' });
                }
            }
        } catch (roomStatusErr) {
            console.warn('Non-critical: failed to sync room status after migration:', roomStatusErr.message);
        }

        // 2. Update room reference for open/pending future rent payments
        try {
            const pendingPayments = await financialService.getRentPaymentsByTenant(tenantId);
            const futurePending = pendingPayments.filter(p => p.paymentStatus === 'pending');
            for (const payment of futurePending) {
                await financialService.updateRentPayment(payment.paymentId, {
                    roomId: targetRoomId,
                    propertyId: targetPropertyId
                });
            }
        } catch (rentErr) {
            console.warn('Non-critical: failed to update future rent payment room reference:', rentErr.message);
        }

        // 3. Create Audit Notification
        try {
            await notificationService.createNotification(
                tenant.userId || dbUser.userId,
                targetPropertyId,
                'TENANT_MIGRATION',
                'Room Migration Complete',
                `Tenant ${tenant.name} moved from Room ${sourceRoom.roomNumber} (Bed ${tenant.bedNumber}) to Room ${targetRoom.roomNumber} (Bed ${targetBedNumber})`,
                tenantId,
                'tenant',
                {
                    previousPropertyId: tenant.propertyId,
                    previousRoomId: tenant.roomId,
                    previousRoomNumber: sourceRoom.roomNumber,
                    previousBedNumber: tenant.bedNumber,
                    newPropertyId: targetPropertyId,
                    newRoomId: targetRoomId,
                    newRoomNumber: targetRoom.roomNumber,
                    newBedNumber: String(targetBedNumber).trim(),
                    effectiveDate,
                    reason: reason || 'Tenant room transfer request',
                    movedByUserId: dbUser.userId
                }
            );
        } catch (auditErr) {
            console.warn('Non-critical: failed to create migration audit log:', auditErr.message);
        }

        console.log(`Tenant ${tenantId} migrated successfully from Room ${sourceRoom.roomNumber} to Room ${targetRoom.roomNumber}`);

        return response.success({
            message: 'Tenant room migration completed successfully',
            migration: {
                tenantId,
                tenantName: tenant.name,
                previousAssignment: {
                    propertyId: tenant.propertyId,
                    roomId: tenant.roomId,
                    roomNumber: sourceRoom.roomNumber,
                    bedNumber: tenant.bedNumber
                },
                newAssignment: {
                    propertyId: targetPropertyId,
                    roomId: targetRoomId,
                    roomNumber: targetRoom.roomNumber,
                    bedNumber: String(targetBedNumber).trim()
                },
                effectiveDate,
                rentAmount: updatedRent,
                reason: reason || null
            }
        }, 200);

    } catch (err) {
        console.error('Tenant migration error:', err);

        if (err.code === 'TransactionCanceledException') {
            const reasons = (err.CancellationReasons || [])
                .map((r, i) => r.Code !== 'None' ? `Step ${i + 1}: ${r.Code}` : null)
                .filter(Boolean);
            console.error('Transaction cancelled reasons:', reasons);
            return response.error(
                'Migration failed due to a concurrency conflict — the selected bed or room capacity may have changed. Please retry.',
                409
            );
        }

        return response.error(err.message || 'Failed to migrate tenant', 500);
    }
};
