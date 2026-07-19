const response = require('./response');
const subscriptionService = require('../services/subscription.service');

const guardOwnerWrite = async (event, options = {}) => {
    const dbUser = event.requestContext?.authorizer;
    if (!dbUser || dbUser.userType === 'admin' || dbUser.userType !== 'owner') return null;

    try {
        await subscriptionService.assertOwnerWriteAccess(dbUser.userId, options);
        return null;
    } catch (error) {
        if (error instanceof subscriptionService.SubscriptionAccessError) {
            return response.error(error.message, error.statusCode, error.details);
        }
        throw error;
    }
};

module.exports = { guardOwnerWrite };
