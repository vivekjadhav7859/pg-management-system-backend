const complaintsService = require('../../services/complaints.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners/admins can update complaint status', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        const { propertyId, complaintId } = event.pathParameters;
        const body = JSON.parse(event.body);
        const { status, notes } = body;

        if (!status) {
            return response.error('Status is required', 400);
        }

        // Verify property ownership
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('Unauthorized access to property', 403);
        }

        const existingComplaint = await complaintsService.getComplaintById(complaintId);
        if (!existingComplaint) {
            return response.error('Complaint not found', 404);
        }

        const updatedComplaint = await complaintsService.updateComplaintStatus(complaintId, status, notes);

        return response.success({
            message: 'Complaint status updated successfully',
            complaint: updatedComplaint
        });

    } catch (err) {
        console.error('Update complaint status error:', err);
        return response.error('Failed to update complaint status', 500);
    }
};
