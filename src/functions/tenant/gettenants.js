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

        let cognitoUser;
        try {
            cognitoUser = await verifyToken(accessToken);
        } catch (tokenErr) {
            console.error('Token verification failed:', tokenErr);
            return response.error('Invalid or expired token', 401);
        }

        if (!cognitoUser || !cognitoUser.email) {
            return response.error('Unable to extract user from token', 401);
        }

        const dbUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!dbUser) {
            return response.error('User not found', 404);
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
