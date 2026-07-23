/**
 * WebPushProvider - PWA Web Push Notification provider extending NotificationProvider.
 * Uses web-push library with VAPID keys for browser push notifications.
 */
const NotificationProvider = require('../notificationProvider');
let webpush;
try {
    webpush = require('web-push');
} catch (_) {
    webpush = null;
}

class WebPushProvider extends NotificationProvider {
    constructor() {
        super();
        this.publicKey = process.env.VAPID_PUBLIC_KEY || 'BLoZ4JFQk6qq0UVqh-6yxEDm6mH1HbRwHpkiw6lMUPigOkivUUJ4SI7J8KHWJccdyDWzn-cdIq2z6vwbYzoU4Io';
        this.privateKey = process.env.VAPID_PRIVATE_KEY || 'rsBVKQW9UkEICpFp9zZlEdRPrmiEFSqnSywdzGs_gsE';
        this.subject = process.env.VAPID_SUBJECT || 'mailto:support@gobanqo.com';

        if (webpush && this.publicKey && this.privateKey) {
            try {
                webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
            } catch (err) {
                console.error('[WebPushProvider] Failed to set VAPID details:', err.message);
            }
        }
    }


    get channel() {
        return 'push';
    }

    /**
     * Send Web Push Notification to a subscription endpoint
     * @param {Object} options
     * @param {Object|Array} options.subscription - WebPush subscription object(s) { endpoint, keys: { p256dh, auth } }
     * @param {string} options.title - Notification title
     * @param {string} options.body - Notification text body
     * @param {string} [options.icon] - Icon URL
     * @param {string} [options.badge] - Badge URL
     * @param {Object} [options.data] - Custom payload data (e.g., target URL)
     * @param {Array} [options.actions] - Quick action buttons
     */
    async send({ subscription, title, body, icon, badge, data = {}, actions = [] }) {
        if (!subscription) {
            return {
                success: false,
                error: 'No push subscription provided',
                provider: 'webpush'
            };
        }

        const subscriptions = Array.isArray(subscription) ? subscription : [subscription];
        if (subscriptions.length === 0) {
            return {
                success: false,
                error: 'Empty push subscription array',
                provider: 'webpush'
            };
        }

        const payload = JSON.stringify({
            title: title || 'GoBanqo Alert',
            body: body || '',
            icon: icon || '/brand/logo-icon.png',
            badge: badge || '/brand/badge-icon.png',
            data: {
                url: data.url || '/tenant/dashboard',
                timestamp: Date.now(),
                ...data
            },
            actions: actions || []
        });

        // Dev simulation fallback if webpush or keys not fully set
        if (!webpush || !this.publicKey || !this.privateKey) {
            console.log(`[WebPushProvider] DEV/SIMULATED PUSH DISPATCH: "${title}" -> ${subscriptions.length} subscribers`);
            return {
                success: true,
                messageId: `dev-push-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                provider: 'webpush-simulated',
                warning: 'VAPID keys or web-push module pending production configuration.'
            };
        }

        let sentCount = 0;
        let failedCount = 0;
        const errors = [];
        const expiredEndpoints = [];

        for (const sub of subscriptions) {
            if (!sub || !sub.endpoint) continue;
            try {
                const pushSub = {
                    endpoint: sub.endpoint,
                    keys: sub.keys || {}
                };
                await webpush.sendNotification(pushSub, payload);
                sentCount++;
            } catch (err) {
                failedCount++;
                console.error(`[WebPushProvider] Push error for endpoint ${sub.endpoint}:`, err.message);
                errors.push(err.message);
                if (err.statusCode === 410 || err.statusCode === 404) {
                    expiredEndpoints.push(sub.endpoint);
                }
            }
        }

        return {
            success: sentCount > 0,
            sentCount,
            failedCount,
            expiredEndpoints,
            messageId: sentCount > 0 ? `push-${Date.now()}` : null,
            error: errors.length > 0 ? errors.join('; ') : null,
            provider: 'webpush'
        };
    }
}

module.exports = WebPushProvider;
