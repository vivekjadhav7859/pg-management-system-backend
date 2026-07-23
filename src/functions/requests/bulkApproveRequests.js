const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const response = require('../../utils/response');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const notificationService = require('../../services/notification.service');
const financialService = require('../../services/financial.service');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');
const { NOTIFICATION_EVENTS } = require('../../constants/notificationEvents');

const dynamodb = new AWS.DynamoDB.DocumentClient();

function bedAssignmentId(roomId, bedNumber) {
    return `reservation#${roomId}#${String(bedNumber).trim()}`;
}

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can bulk approve requests', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        const body = JSON.parse(event.body || '{}');
        const { requestIds } = body;

        if (!Array.isArray(requestIds) || requestIds.length === 0) {
            return response.error('Array of requestIds is required', 400);
        }

        const approvedList = [];
        const failedList = [];
        const timestamp = new Date().toISOString();

        for (const requestId of requestIds) {
            try {
                const existing = await dynamodb.get({
                    TableName: process.env.NOTIFICATION_TABLE,
                    Key: { id: requestId },
                }).promise();

                const request = existing.Item;
                if (!request) {
                    failedList.push({ requestId, reason: 'Request not found' });
                    continue;
                }

                if (request.userIdIndex !== dbUser.userId && dbUser.userType !== 'admin') {
                    failedList.push({ requestId, reason: 'Unauthorized for this request' });
                    continue;
                }

                if (request.requestStatus !== 'pending') {
                    failedList.push({ requestId, reason: `Request is already ${request.requestStatus}` });
                    continue;
                }

                const selectedRoomId = request.roomId || request.requestedRoomId;
                const selectedBedNumber = String(request.bedNumber || request.requestedBedNumber || '').trim();

                if (!selectedRoomId || !selectedBedNumber) {
                    failedList.push({ requestId, reason: 'Missing room or bed assignment' });
                    continue;
                }

                // Verify room availability
                const room = await propertyService.getRoomById(selectedRoomId);
                if (!room || room.availableBeds <= 0 || room.status === 'maintenance') {
                    failedList.push({ requestId, reason: `Room ${room?.roomNumber || selectedRoomId} is no longer available` });
                    continue;
                }

                // Check bed lock
                const activeAssignments = await tenantService.getBedAssignmentsByRoom(selectedRoomId);
                const isBedTaken = activeAssignments.some(a => String(a.bedNumber).trim() === selectedBedNumber && a.status === 'assigned');
                if (isBedTaken) {
                    failedList.push({ requestId, reason: `Bed ${selectedBedNumber} in Room ${room.roomNumber} is already occupied` });
                    continue;
                }

                // Execute approval
                const tenantId = uuidv4();
                const assignmentId = bedAssignmentId(selectedRoomId, selectedBedNumber);
                const property = await propertyService.getPropertyById(request.propertyIdIndex);

                const tenantName = request.tenantName || request.tenantEmail || 'Tenant';
                const tenantItem = {
                    tenantId,
                    userId: request.tenantUserId || `request-${requestId}`,
                    propertyId: request.propertyIdIndex,
                    roomId: selectedRoomId,
                    roomNumber: room.roomNumber,
                    bedNumber: selectedBedNumber,
                    name: tenantName,
                    email: request.tenantEmail || '',
                    phone: request.tenantPhone || '',
                    emergencyContact: request.emergencyContact || {},
                    kycDocuments: request.kycDocuments || {},
                    kycStatus: request.kycDocuments && Object.keys(request.kycDocuments).length > 0 ? 'verified' : 'pending',
                    checkInDate: timestamp.slice(0, 10),
                    checkOutDate: null,
                    rentAmount: Number(room.rentPerBed || 0),
                    securityDeposit: Number(room.securityDeposit || 0),
                    depositPaid: false,
                    depositAmount: 0,
                    depositDate: null,
                    status: 'in_progress',
                    tenancyStatus: 'onboarding',
                    onboardingStatus: 'activated',
                    sourceRequestId: requestId,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    propertyIdIndex: request.propertyIdIndex,
                    roomIdIndex: selectedRoomId,
                    userIdIndex: request.tenantUserId || `request-${requestId}`,
                    statusIndex: 'in_progress',
                };

                await dynamodb.transactWrite({
                    TransactItems: [
                        {
                            Update: {
                                TableName: process.env.NOTIFICATION_TABLE,
                                Key: { id: requestId },
                                UpdateExpression: 'SET requestStatus = :app, approvedAt = :ts, #read = :t, tenantId = :tId',
                                ExpressionAttributeNames: { '#read': 'read' },
                                ExpressionAttributeValues: {
                                    ':app': 'approved',
                                    ':ts': timestamp,
                                    ':t': true,
                                    ':tId': tenantId,
                                    ':pending': 'pending'
                                },
                                ConditionExpression: 'requestStatus = :pending'
                            }
                        },
                        {
                            Put: {
                                TableName: process.env.TENANT_TABLE,
                                Item: tenantItem,
                                ConditionExpression: 'attribute_not_exists(tenantId)'
                            }
                        },
                        {
                            Update: {
                                TableName: process.env.BED_ASSIGNMENT_TABLE,
                                Key: { assignmentId },
                                UpdateExpression: 'SET tenantId = :tId, propertyId = :pId, roomId = :rId, bedNumber = :bNum, assignedDate = :aDate, #status = :assigned, updatedAt = :ts',
                                ExpressionAttributeNames: { '#status': 'status' },
                                ExpressionAttributeValues: {
                                    ':tId': tenantId,
                                    ':pId': request.propertyIdIndex,
                                    ':rId': selectedRoomId,
                                    ':bNum': selectedBedNumber,
                                    ':aDate': timestamp,
                                    ':assigned': 'assigned',
                                    ':ts': timestamp,
                                }
                            }
                        },
                        {
                            Update: {
                                TableName: process.env.ROOM_TABLE,
                                Key: { roomId: selectedRoomId },
                                UpdateExpression: 'SET availableBeds = availableBeds - :one, occupiedBeds = occupiedBeds + :one, updatedAt = :ts',
                                ExpressionAttributeValues: { ':one': 1, ':ts': timestamp, ':zero': 0 },
                                ConditionExpression: 'availableBeds > :zero'
                            }
                        },
                        ...(request.tenantUserId ? [{
                            Update: {
                                TableName: process.env.USER_TABLE,
                                Key: { userId: request.tenantUserId },
                                UpdateExpression: 'SET linkedPropertyId = :pId, linkedOwnerId = :oId, updatedAt = :ts',
                                ExpressionAttributeValues: {
                                    ':pId': request.propertyIdIndex,
                                    ':oId': dbUser.userId,
                                    ':ts': timestamp
                                }
                            }
                        }] : [])
                    ]
                }).promise();

                // Auto-create rent ledger entry
                try {
                    await financialService.createRentPayment({
                        tenantId,
                        propertyId: request.propertyIdIndex,
                        roomId: selectedRoomId,
                        amount: Number(room.rentPerBed || 0),
                        paymentMonth: timestamp.slice(0, 7),
                        dueDate: timestamp.slice(0, 10),
                        paymentStatus: 'pending',
                        notes: 'Auto-generated rent invoice from bulk approval'
                    });
                } catch (_) {}

                // Send welcome notice
                try {
                    await notificationService.sendNotification({
                        type: NOTIFICATION_EVENTS.TENANT_ASSIGNED,
                        ownerId: dbUser.userId,
                        tenantId,
                        tenantEmail: request.tenantEmail,
                        propertyId: request.propertyIdIndex,
                        data: {
                            tenantName,
                            ownerName: dbUser.name || property?.propertyName || 'Property Owner',
                            propertyName: request.propertyName,
                            roomNumber: room.roomNumber,
                            bedNumber: selectedBedNumber,
                            rentAmount: Number(room.rentPerBed || 0)
                        },
                        idempotencyKey: `BULK_APPROVE#${requestId}`
                    });
                } catch (_) {}

                approvedList.push({
                    requestId,
                    tenantName,
                    roomNumber: room.roomNumber,
                    bedNumber: selectedBedNumber,
                });

            } catch (itemErr) {
                console.error(`[bulkApproveRequests] Failed for requestId ${requestId}:`, itemErr);
                failedList.push({ requestId, reason: itemErr.message || 'Transaction failed' });
            }
        }

        return response.success({
            message: `Bulk approval complete. ${approvedList.length} approved, ${failedList.length} failed.`,
            approvedCount: approvedList.length,
            failedCount: failedList.length,
            approved: approvedList,
            failed: failedList,
        });

    } catch (err) {
        console.error('[bulkApproveRequests]', err);
        return response.error(err.message || 'Failed to bulk approve requests', 500);
    }
};
