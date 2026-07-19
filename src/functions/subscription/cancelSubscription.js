const response = require('../../utils/response');
const subscriptionService = require('../../services/subscription.service');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);

        const status = await subscriptionService.cancelSubscription(dbUser.userId);
        return response.success({
            message: 'Your subscription will cancel at the end of the current billing cycle',
            subscription: status
        });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        const statusCode = error.code === 'NO_ACTIVE_SUBSCRIPTION' ? 400 : 502;
        return response.error(error.message || 'Failed to cancel subscription', statusCode, {
            code: error.code || 'SUBSCRIPTION_CANCEL_FAILED'
        });
    }
};
