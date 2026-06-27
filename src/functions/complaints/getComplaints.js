const complaintsService = require('../../services/complaints.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        const { propertyId } = event.pathParameters;

        // Verify property access
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (dbUser.userType === 'owner' && property.ownerId !== dbUser.userId) {
            return response.error('Unauthorized to view these complaints', 403);
        }

        const complaints = await complaintsService.getComplaintsByProperty(propertyId);

        // If user is tenant, only show their own complaints
        let filteredComplaints = complaints;
        if (dbUser.userType === 'tenant') {
            const tenant = await tenantService.getTenantByUserId(dbUser.userId);
            if (!tenant || tenant.propertyId !== propertyId) {
                return response.error('Unauthorized to view these complaints', 403);
            }
            filteredComplaints = complaints.filter(c => c.tenantIdIndex === tenant.tenantId);
        }

        return response.success({
            complaints: filteredComplaints
        });

    } catch (err) {
        console.error('Get complaints error:', err);
        return response.error('Failed to get complaints', 500);
    }
};
