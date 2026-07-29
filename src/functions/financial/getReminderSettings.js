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

        const responseSettings = {
            propertyId: propertyId,
            autoEnabled: settings?.autoEnabled ?? true,
            daysBefore: settings?.daysBefore ?? 3,
            daysAfter: settings?.daysAfter ?? 2,
            channels: settings?.channels || ['email'],
            welcomeEnabled: settings?.welcomeEnabled ?? true,
            rentReminderEnabled: settings?.rentReminderEnabled ?? true,
            receiptEnabled: settings?.receiptEnabled ?? true,
            overdueEnabled: settings?.overdueEnabled ?? true,
            complaintUpdatesEnabled: settings?.complaintUpdatesEnabled ?? true,
            provider: 'AWS_SES',
            providerStatus: 'ACTIVE',
            updatedAt: settings?.updatedAt || new Date().toISOString()
        };

        return response.success({
            message: 'Notification settings retrieved successfully',
            settings: responseSettings
        });

    } catch (err) {
        console.error('Get reminder settings error:', err);
        return response.error('Failed to retrieve reminder settings', 500);
    }
};
