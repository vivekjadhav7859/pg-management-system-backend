const propertyService = require('../../services/property.service');
const subscriptionService = require('../../services/subscription.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can activate property management', 403);
        }

        const propertyId = event.pathParameters?.propertyId;
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) return response.error('Property not found', 404);
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only activate your own properties', 403);
        }
        if (property.managementEnabled !== false) {
            return response.success({ message: 'Management is already active', property });
        }

        if (dbUser.userType !== 'admin') {
            try {
                await subscriptionService.assertCanAddManagedProperty(dbUser.userId);
            } catch (error) {
                if (error instanceof subscriptionService.SubscriptionAccessError) {
                    return response.error(error.message, error.statusCode, error.details);
                }
                throw error;
            }
        }

        const updatedProperty = await propertyService.updateProperty(propertyId, { managementEnabled: true });
        return response.success({
            message: 'Property management activated',
            property: updatedProperty,
            subscription: await subscriptionService.getStatus(dbUser.userId)
        });
    } catch (error) {
        console.error('Activate property management error:', error);
        return response.error('Failed to activate property management', 500);
    }
};
