const response = require('../../utils/response');

/**
 * GET /notifications/vapid-public-key
 * Returns the public VAPID key for Web Push PWA subscriptions.
 */
exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || 'BLoZ4JFQk6qq0UVqh-6yxEDm6mH1HbRwHpkiw6lMUPigOkivUUJ4SI7J8KHWJccdyDWzn-cdIq2z6vwbYzoU4Io';

        return response.success({
            vapidPublicKey,
            configured: Boolean(vapidPublicKey)
        });

    } catch (err) {
        console.error('[getVapidPublicKey] Error:', err);
        return response.error('Failed to retrieve VAPID public key', 500);
    }
};
