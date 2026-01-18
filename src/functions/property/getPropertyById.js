const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');
        const cognitoUser = await verifyToken(accessToken);
        const dbUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!dbUser || dbUser.status !== 'active') {
            return response.error('User not found or not active', 403);
        }

        const propertyId = event.pathParameters.propertyId;
        const property = await propertyService.getPropertyById(propertyId);

        if (!property) {
            return response.error('Property not found', 404);
        }

        // Check ownership
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only view your own properties', 403);
        }

        return response.success({
            message: 'Property retrieved successfully',
            property: property
        });

    } catch (err) {
        console.error('Get property error:', err);
        return response.error('Failed to retrieve property', 500);
    }
};
