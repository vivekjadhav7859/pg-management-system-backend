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

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only delete your own properties', 403);
        }

        // Check if property has active tenants
        if (property.occupiedBeds > 0) {
            return response.error('Cannot delete property with active tenants', 400);
        }

        await propertyService.deleteProperty(propertyId);

        return response.success({
            message: 'Property deleted successfully',
            propertyId: propertyId
        });

    } catch (err) {
        console.error('Delete property error:', err);
        return response.error('Failed to delete property', 500);
    }
};
