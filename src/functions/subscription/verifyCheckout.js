const response = require('../../utils/response');
const subscriptionService = require('../../services/subscription.service');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);

        const body = JSON.parse(event.body || '{}');
        const required = ['razorpay_payment_id', 'razorpay_order_id', 'razorpay_signature'];
        if (required.some(field => !body[field])) {
            return response.error('Incomplete Razorpay verification payload', 400);
        }

        const status = await subscriptionService.verifyCheckout(dbUser.userId, body);
        return response.success({
            message: 'Prepaid annual payment verified successfully',
            subscription: status
        });
    } catch (error) {
        console.error('Verify subscription checkout error:', error);
        const statusCode = error.code === 'INVALID_SIGNATURE' ? 400 : 502;
        return response.error(error.message || 'Failed to verify subscription', statusCode, {
            code: error.code || 'SUBSCRIPTION_VERIFICATION_FAILED'
        });
    }
};
