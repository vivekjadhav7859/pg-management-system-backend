const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');

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
        }

        const timestamp = new Date().toISOString();
        const requestId = uuidv4();
        const title = requestType === 'visit' ? 'Schedule Visit Request' : 'Booking Request';
        const description = [
            `${dbUser.name || dbUser.email || 'A tenant'} requested ${requestType === 'visit' ? 'a visit' : 'a booking'} for ${property.propertyName}.`,
            room ? `Room ${room.roomNumber}.` : '',
            visitDate ? `Preferred date: ${visitDate}.` : '',
            message ? `Note: ${message}` : '',
        ].filter(Boolean).join(' ');

        const ownerRequest = {
            id: requestId,
            userIdIndex: property.ownerId,
            propertyIdIndex: propertyId,
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

        return response.success({
            message: 'Request sent successfully',
            request: ownerRequest,
        }, 201);
    } catch (err) {
        console.error('[createBookingRequest]', err);
        return response.error('Failed to create request', 500);
    }
};
