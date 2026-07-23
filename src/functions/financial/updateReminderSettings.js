const propertyService = require('../../services/property.service');
const financialService = require('../../services/financial.service');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can update reminder settings', 403);
        }

        const propertyId = event.pathParameters.propertyId;

        // Verify property ownership
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only update settings for your properties', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        const body = JSON.parse(event.body || '{}');
        const {
            autoEnabled,
            daysBefore,
            daysAfter,
            channels,
            welcomeEnabled,
            rentReminderEnabled,
            receiptEnabled,
            overdueEnabled,
            complaintUpdatesEnabled
        } = body;

        // Validate daysBefore and daysAfter
        if (daysBefore !== undefined && (daysBefore < 0 || daysBefore > 30)) {
            return response.error('daysBefore must be between 0 and 30', 400);
        }

        if (daysAfter !== undefined && (daysAfter < 0 || daysAfter > 30)) {
            return response.error('daysAfter must be between 0 and 30', 400);
        }

        // Build the settings update object
        const settingsUpdate = {
            autoEnabled: autoEnabled !== undefined ? autoEnabled : true,
            daysBefore: daysBefore !== undefined ? daysBefore : 3,
            daysAfter: daysAfter !== undefined ? daysAfter : 2,
            channels: channels || ['email'],
            welcomeEnabled: welcomeEnabled !== undefined ? welcomeEnabled : true,
            rentReminderEnabled: rentReminderEnabled !== undefined ? rentReminderEnabled : true,
            receiptEnabled: receiptEnabled !== undefined ? receiptEnabled : true,
            overdueEnabled: overdueEnabled !== undefined ? overdueEnabled : true,
            complaintUpdatesEnabled: complaintUpdatesEnabled !== undefined ? complaintUpdatesEnabled : true,
            updatedAt: new Date().toISOString()
        };

        const settings = await financialService.updateReminderSettings(propertyId, settingsUpdate);

        return response.success({
            message: 'Notification settings updated successfully',
            settings: {
                propertyId: settings.propertyId,
                autoEnabled: settings.autoEnabled,
                daysBefore: settings.daysBefore,
                daysAfter: settings.daysAfter,
                channels: settings.channels,
                welcomeEnabled: settings.welcomeEnabled,
                rentReminderEnabled: settings.rentReminderEnabled,
                receiptEnabled: settings.receiptEnabled,
                overdueEnabled: settings.overdueEnabled,
                complaintUpdatesEnabled: settings.complaintUpdatesEnabled,
                provider: 'AWS_SES',
                updatedAt: settings.updatedAt
            }
        });

    } catch (err) {
        console.error('Update reminder settings error:', err);
        return response.error('Failed to update reminder settings', 500);
    }
};
