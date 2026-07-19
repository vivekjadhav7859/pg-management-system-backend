const response = require('../../utils/response');
const subscriptionService = require('../../services/subscription.service');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Subscriptions are available to owners only', 403);
        }

        const status = await subscriptionService.getStatus(dbUser.userId);
        return response.success({ subscription: status });
    } catch (error) {
        console.error('Get subscription status error:', error);
        return response.error('Failed to load subscription status', 500);
    }
};
