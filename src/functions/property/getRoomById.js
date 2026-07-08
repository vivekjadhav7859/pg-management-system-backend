
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        const roomId = event.pathParameters.roomId;
        const room = await propertyService.getRoomById(roomId);

        if (!room) {
            return response.error('Room not found', 404);
        }

        // Check if user owns the property
        const property = await propertyService.getPropertyById(room.propertyId);
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only view rooms of your own properties', 403);
        }

        return response.success({
            message: 'Room retrieved successfully',
            room: room
        });

    } catch (err) {
        console.error('Get room error:', err);
        return response.error('Failed to retrieve room', 500);
    }
};