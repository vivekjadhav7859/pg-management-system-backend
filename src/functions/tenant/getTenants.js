
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        if (dbUser.status !== 'active') {
            return response.error('Account is not active', 403);
        }

        const propertyId = event.pathParameters?.propertyId;
        if (!propertyId) {
            return response.error('Property ID is required', 400);
        }

        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        const isAdmin = dbUser.userType === 'admin';
        const isOwner = dbUser.userType === 'owner' && property.ownerId === dbUser.userId;

        if (!isAdmin && !isOwner) {
            return response.error('You can only view tenants of your own properties', 403);
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
