const response = require('../../utils/response');
const subscriptionService = require('../../services/subscription.service');

const getHeader = (headers = {}, name) => {
    const key = Object.keys(headers).find(header => header.toLowerCase() === name.toLowerCase());
    return key ? headers[key] : null;
};

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const rawBody = event.isBase64Encoded
            ? Buffer.from(event.body || '', 'base64').toString('utf8')
            : (event.body || '');
        const signature = getHeader(event.headers, 'x-razorpay-signature');
        const eventId = getHeader(event.headers, 'x-razorpay-event-id');
        if (!signature) return response.error('Webhook signature is required', 400);

        const result = await subscriptionService.processWebhook(rawBody, signature, eventId);
        return response.success(result);
    } catch (error) {
        console.error('Razorpay webhook error:', error);
        const statusCode = error.code === 'INVALID_SIGNATURE' ? 400 : 500;
        return response.error(error.message || 'Webhook processing failed', statusCode);
    }
};
