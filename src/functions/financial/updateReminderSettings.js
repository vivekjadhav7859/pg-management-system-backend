
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const financialService = require('../../services/financial.service');
const { encryptSecret } = require('../../utils/crypto');
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

        const body = JSON.parse(event.body);
        const { autoEnabled, daysBefore, daysAfter, channels, emailConfig } = body;

        // Validate daysBefore and daysAfter
        if (daysBefore !== undefined && (daysBefore < 0 || daysBefore > 30)) {
            return response.error('daysBefore must be between 0 and 30', 400);
        }

        if (daysAfter !== undefined && (daysAfter < 0 || daysAfter > 30)) {
            return response.error('daysAfter must be between 0 and 30', 400);
        }

        // Validate channels
        const validChannels = ['email'];
        if (channels && !channels.every(c => validChannels.includes(c))) {
            return response.error('Invalid channel. Supported: email', 400);
        }

        // Build the settings update object
        const settingsUpdate = {
            autoEnabled: autoEnabled !== undefined ? autoEnabled : true,
            daysBefore: daysBefore || 3,
            daysAfter: daysAfter || 2,
            channels: channels || ['email']
        };

        // Handle emailConfig — encrypt password before storage
        if (emailConfig) {
            if (!emailConfig.provider || !emailConfig.user || !emailConfig.password) {
                return response.error('emailConfig requires provider, user, and password', 400);
            }

            const validProviders = ['gmail', 'outlook', 'custom'];
            if (!validProviders.includes(emailConfig.provider)) {
                return response.error('Invalid provider. Supported: gmail, outlook, custom', 400);
            }

            if (emailConfig.provider === 'custom' && !emailConfig.host) {
                return response.error('SMTP host is required for custom providers', 400);
            }

            // Encrypt the plaintext password using KMS
            const encryptedPassword = await encryptSecret(emailConfig.password);

            settingsUpdate.emailConfig = {
                provider: emailConfig.provider,
                user: emailConfig.user,
                encryptedPassword: encryptedPassword,
                host: emailConfig.host || null,
                port: emailConfig.port || null
            };
            // The plaintext password is intentionally NOT stored
        }

        const settings = await financialService.updateReminderSettings(propertyId, settingsUpdate);

        return response.success({
            message: 'Reminder settings updated successfully',
            settings: {
                propertyId: settings.propertyId,
                autoEnabled: settings.autoEnabled,
                daysBefore: settings.daysBefore,
                daysAfter: settings.daysAfter,
                channels: settings.channels,
                emailConfigured: !!settings.emailConfig,
                updatedAt: settings.updatedAt
            }
        });

    } catch (err) {
        console.error('Update reminder settings error:', err);
        return response.error('Failed to update reminder settings', 500);
    }
};
