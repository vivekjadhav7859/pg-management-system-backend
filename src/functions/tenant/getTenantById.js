
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

        const tenantId = event.pathParameters.tenantId;
        const tenant = await tenantService.getTenantById(tenantId);

        if (!tenant) {
            return response.error('Tenant not found', 404);
        }

        // Verify property ownership
        const property = await propertyService.getPropertyById(tenant.propertyId);
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only view tenants of your properties', 403);
        }

        return response.success({
            message: 'Tenant retrieved successfully',
            tenant: tenant
        });

    } catch (err) {
        console.error('Get tenant error:', err);
        return response.error('Failed to retrieve tenant', 500);
    }
};
