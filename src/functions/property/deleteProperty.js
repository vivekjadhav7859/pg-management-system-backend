
const dynamoService = require('../../services/dynamodb.service');
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

        const propertyId = event.pathParameters.propertyId;
        const property = await propertyService.getPropertyById(propertyId);

        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only delete your own properties', 403);
        }

        // Removing a property must stay available while over a downgraded plan limit.
        const subscriptionDenied = await guardOwnerWrite(event, { allowWhenLocked: true, startTrial: false });
        if (subscriptionDenied) return subscriptionDenied;

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
