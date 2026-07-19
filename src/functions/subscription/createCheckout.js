const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');
const subscriptionService = require('../../services/subscription.service');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can purchase a subscription', 403);
        }

        const body = JSON.parse(event.body || '{}');
        if (!body.planKey) return response.error('planKey is required', 400);

        const owner = await dynamoService.getUserById(dbUser.userId);
        if (!owner) return response.error('Owner account not found', 404);

        const checkout = await subscriptionService.createCheckout(owner, body.planKey);
        return response.success({ checkout });
    } catch (error) {
        console.error('Create subscription checkout error:', error);
        const knownErrors = new Set([
            'INVALID_PLAN', 'PLAN_NOT_CONFIGURED', 'RAZORPAY_NOT_CONFIGURED',
            'ALREADY_SUBSCRIBED', 'PLAN_CONFIGURATION_MISMATCH'
        ]);
        const statusCode = knownErrors.has(error.code) ? 400 : 502;
        return response.error(error.message || 'Failed to create subscription checkout', statusCode, {
            code: error.code || 'CHECKOUT_CREATION_FAILED'
        });
    }
};
