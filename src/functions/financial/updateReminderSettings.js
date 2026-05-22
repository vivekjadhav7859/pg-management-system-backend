const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const financialService = require('../../services/financial.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');
        const cognitoUser = await verifyToken(accessToken);
        const dbUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!dbUser || dbUser.status !== 'active') {
            return response.error('User not found or not active', 403);
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

        const body = JSON.parse(event.body);
        const { autoEnabled, daysBefore, daysAfter, channels } = body;

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

        const settings = await financialService.updateReminderSettings(propertyId, {
            autoEnabled: autoEnabled !== undefined ? autoEnabled : true,
            daysBefore: daysBefore || 3,
            daysAfter: daysAfter || 2,
            channels: channels || ['email']
        });

        return response.success({
            message: 'Reminder settings updated successfully',
            settings: settings
        });

    } catch (err) {
        console.error('Update reminder settings error:', err);
        return response.error('Failed to update reminder settings', 500);
    }
};
