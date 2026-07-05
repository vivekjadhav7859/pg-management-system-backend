
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        const propertyId = event.pathParameters.propertyId;
        const property = await propertyService.getPropertyById(propertyId);

        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only view rooms of your own properties', 403);
        }

        const result = await propertyService.getRoomsByProperty(propertyId);

        return response.success({
            message: 'Rooms retrieved successfully',
            rooms: result.rooms,
            count: result.rooms.length,
            propertyId: propertyId
        });

    } catch (err) {
        console.error('Get rooms error:', err);
        return response.error('Failed to retrieve rooms', 500);
    }
};