const notificationService = require('../../services/notification.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        if (dbUser.status !== 'active') {
            return response.error('Account is not active', 403);
        }

        const limit = parseInt(event.queryStringParameters?.limit || '50', 10);
        let lastEvaluatedKey = null;
        if (event.queryStringParameters?.lastKey) {
            try {
                lastEvaluatedKey = JSON.parse(decodeURIComponent(event.queryStringParameters.lastKey));
            } catch (_) {}
        }

        const result = await notificationService.getLogsByOwner(dbUser.userId, limit, lastEvaluatedKey);

        return response.success({
            message: 'Notification logs retrieved successfully',
            logs: result.logs,
            lastEvaluatedKey: result.lastEvaluatedKey,
            count: result.logs.length
        });
    } catch (err) {
        console.error('[getNotificationLogs] Handler error:', err);
        return response.error('Failed to retrieve notification logs', 500);
    }
};
