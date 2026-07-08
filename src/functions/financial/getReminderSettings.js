
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const financialService = require('../../services/financial.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        const propertyId = event.pathParameters.propertyId;

        // Verify property ownership
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only view settings for your properties', 403);
        }

        const settings = await financialService.getReminderSettings(propertyId);

        return response.success({
            message: 'Reminder settings retrieved successfully',
            settings: settings || {
                propertyId: propertyId,
                autoEnabled: true,
                daysBefore: 3,
                daysAfter: 2,
                channels: ['email']
            }
        });

    } catch (err) {
        console.error('Get reminder settings error:', err);
        return response.error('Failed to retrieve reminder settings', 500);
    }
};
