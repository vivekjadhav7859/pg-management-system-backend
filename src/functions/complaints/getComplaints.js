const complaintsService = require('../../services/complaints.service');
const propertyService = require('../../services/property.service');
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

        if (dbUser.userType === 'owner' && property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('Unauthorized to view these complaints', 403);
        }

        const complaints = await complaintsService.getComplaintsByProperty(propertyId);

        // If user is tenant, only show their own complaints
        let filteredComplaints = complaints;
        if (dbUser.userType === 'tenant') {
            filteredComplaints = complaints.filter(c => c.tenantIdIndex === dbUser.userId);
        }

        return response.success({
            complaints: filteredComplaints
        });

    } catch (err) {
        console.error('Get complaints error:', err);
        return response.error('Failed to get complaints', 500);
    }
};
