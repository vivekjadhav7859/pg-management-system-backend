
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

        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can check-out tenants', 403);
        }

        const tenantId = event.pathParameters.tenantId;
        const tenant = await tenantService.getTenantById(tenantId);

        if (!tenant) {
            return response.error('Tenant not found', 404);
        }

        // Verify property ownership
        const property = await propertyService.getPropertyById(tenant.propertyId);
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only check-out tenants from your properties', 403);
        }

        if (tenant.status === 'checked_out') {
            return response.error('Tenant is already checked-out', 400);
        }

        const body = JSON.parse(event.body);
        const checkOutDate = body.checkOutDate || new Date().toISOString();

        // Check-out tenant
        await tenantService.checkOutTenant(tenantId, checkOutDate);

        // Release bed (find assignment by tenant)
        // Note: You might want to add a method to get assignment by tenantId
        
        // Update room occupancy
        await propertyService.updateRoomOccupancy(tenant.roomId, -1);

        // Update property occupancy
        await propertyService.updatePropertyOccupancy(tenant.propertyId, -1);

        console.log('Tenant checked-out successfully:', tenantId);

        return response.success({
            message: 'Tenant checked-out successfully',
            tenantId: tenantId,
            checkOutDate: checkOutDate
        });

    } catch (err) {
        console.error('Check-out tenant error:', err);
        return response.error('Failed to check-out tenant', 500);
    }
};