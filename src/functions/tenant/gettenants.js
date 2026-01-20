const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
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

        // Verify property ownership
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only view tenants of your properties', 403);
        }

        const result = await tenantService.getTenantsByProperty(propertyId);

        return response.success({
            message: 'Tenants retrieved successfully',
            tenants: result.tenants,
            count: result.tenants.length,
            propertyId: propertyId
        });

    } catch (err) {
        console.error('Get tenants error:', err);
        return response.error('Failed to retrieve tenants', 500);
    }
};