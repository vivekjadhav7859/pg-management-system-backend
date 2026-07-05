const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const propertyService = require('../../services/property.service');
const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');
const { sendOwnerRequestEmail } = require('../../utils/ownerRequestEmail');
const { formatDateIN, isPastISODateInIST, parseISODateOnly } = require('../../utils/dateFormat');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'tenant') {
            return response.error('Only tenants can create booking requests', 403);
        }

        const body = JSON.parse(event.body || '{}');
        const { propertyId, roomId, requestType, visitDate, message } = body;

        if (!propertyId || !['visit', 'booking'].includes(requestType)) {
            return response.error('propertyId and valid requestType are required', 400);
        }

        if (visitDate) {
            if (!parseISODateOnly(visitDate)) {
                return response.error('Preferred date must use YYYY-MM-DD format', 400);
            }
            if (isPastISODateInIST(visitDate)) {
                return response.error('Preferred date cannot be in the past', 400);
            }
        }

        const property = await propertyService.getPropertyById(propertyId);
        if (!property || property.status !== 'active') {
            return response.error('Property not available', 404);
        }

        let room = null;
        if (roomId) {
            room = await propertyService.getRoomById(roomId);
            if (!room || room.propertyId !== propertyId) {
                return response.error('Room not found for this property', 404);
            }
            if ((room.availableBeds || 0) <= 0 || room.status === 'maintenance') {
                return response.error('Selected room is no longer available', 409);
            }
        }

        const duplicateWindowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const existingRequests = await dynamodb.query({
            TableName: process.env.NOTIFICATION_TABLE,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userIdIndex = :userId',
            FilterExpression: [
                'entityType = :entityType',
                'propertyIdIndex = :propertyId',
                'tenantUserId = :tenantUserId',
                'requestType = :requestType',
                'requestStatus = :pending',
                'createdAt >= :windowStart',
            ].join(' AND '),
            ExpressionAttributeValues: {
                ':userId': property.ownerId,
                ':entityType': 'bookingRequest',
                ':propertyId': propertyId,
                ':tenantUserId': dbUser.userId,
                ':requestType': requestType,
                ':pending': 'pending',
                ':windowStart': duplicateWindowStart,
            },
        }).promise();

        if ((existingRequests.Items || []).length > 0) {
            return response.success({
                message: 'You already sent this request recently',
                request: existingRequests.Items[0],
                deduped: true,
            });
        }

        const timestamp = new Date().toISOString();
        const requestId = uuidv4();
        const title = requestType === 'visit' ? 'Schedule Visit Request' : 'Booking Request';
        const description = [
            `${dbUser.name || dbUser.email || 'A tenant'} requested ${requestType === 'visit' ? 'a visit' : 'a booking'} for ${property.propertyName}.`,
            room ? `Room ${room.roomNumber}.` : '',
            visitDate ? `Preferred date: ${formatDateIN(visitDate)}.` : '',
            message ? `Note: ${message}` : '',
        ].filter(Boolean).join(' ');

        const ownerRequest = {
            id: requestId,
            userIdIndex: property.ownerId,
            propertyIdIndex: propertyId,
            propertyName: property.propertyName || '',
            type: title,
            title,
            description,
            entityId: requestId,
            entityType: 'bookingRequest',
            read: false,
            requestStatus: 'pending',
            requestType,
            tenantUserId: dbUser.userId,
            tenantName: dbUser.name || '',
            tenantEmail: dbUser.email || '',
            tenantPhone: dbUser.phone || dbUser.phoneNumber || '',
            roomId: roomId || null,
            roomNumber: room?.roomNumber || null,
            visitDate: visitDate || null,
            visitDateDisplay: visitDate ? formatDateIN(visitDate) : null,
            message: message || '',
            createdAt: timestamp,
            createdAtIndex: timestamp,
        };

        const tenantCopy = {
            ...ownerRequest,
            id: uuidv4(),
            userIdIndex: dbUser.userId,
            title: `${title} Sent`,
            read: false,
        };

        await Promise.all([
            dynamodb.put({ TableName: process.env.NOTIFICATION_TABLE, Item: ownerRequest }).promise(),
            dynamodb.put({ TableName: process.env.NOTIFICATION_TABLE, Item: tenantCopy }).promise(),
        ]);

        const owner = await dynamoService.getUserById(property.ownerId).catch((ownerErr) => {
            console.warn('[createBookingRequest] owner lookup failed', ownerErr.message);
            return null;
        });

        let emailResult = { sent: false, reason: 'Owner email not found' };
        if (owner?.email) {
            emailResult = await sendOwnerRequestEmail({
                owner,
                tenant: {
                    userId: dbUser.userId,
                    name: dbUser.name,
                    email: dbUser.email,
                    phone: dbUser.phone || dbUser.phoneNumber,
                },
                property,
                requestTitle: title,
                requestType,
                roomNumber: room?.roomNumber,
                visitDate: visitDate ? formatDateIN(visitDate) : '',
                message,
            }).catch((emailErr) => {
                console.warn('[createBookingRequest] non-critical owner email failed', emailErr.message);
                return { sent: false, reason: emailErr.message };
            });
        }

        if (!emailResult.sent) {
            console.warn('[createBookingRequest] owner email not sent', emailResult.reason);
        }

        await dynamodb.update({
            TableName: process.env.NOTIFICATION_TABLE,
            Key: { id: requestId },
            UpdateExpression: 'SET ownerEmailStatus = :status, ownerEmailProvider = :provider, ownerEmailError = :error, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':status': emailResult.sent ? 'sent' : 'failed',
                ':provider': emailResult.provider || null,
                ':error': emailResult.sent ? null : (emailResult.reason || 'Unknown email error'),
                ':updatedAt': new Date().toISOString(),
            },
        }).promise().catch((logErr) => {
            console.warn('[createBookingRequest] failed to update owner email status', logErr.message);
        });

        return response.success({
            message: 'Request sent successfully',
            request: {
                ...ownerRequest,
                ownerEmailStatus: emailResult.sent ? 'sent' : 'failed',
                ownerEmailProvider: emailResult.provider || null,
                ownerEmailError: emailResult.sent ? null : (emailResult.reason || 'Unknown email error'),
            },
        }, 201);
    } catch (err) {
        console.error('[createBookingRequest]', err);
        return response.error('Failed to create request', 500);
    }
};
