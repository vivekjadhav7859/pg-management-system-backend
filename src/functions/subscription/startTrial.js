const response = require('../../utils/response');
const subscriptionService = require('../../services/subscription.service');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can activate management', 403);
        }

        await subscriptionService.startTrial(dbUser.userId);
        const status = await subscriptionService.getStatus(dbUser.userId);
        return response.success({
            message: status.access === 'trialing' ? 'Your 30-day trial is active' : 'Management is already activated',
            subscription: status
        });
    } catch (error) {
        console.error('Start subscription trial error:', error);
        return response.error('Failed to activate management trial', 500);
    }
};
