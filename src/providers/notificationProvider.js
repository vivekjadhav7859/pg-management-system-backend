/**
 * NotificationProvider - Base interface for all notification providers in GoBanqo.
 * Implementations (SESProvider, WhatsAppProvider, SMSProvider) extend this class.
 */
class NotificationProvider {
    /**
     * Provider identification key (e.g., 'email', 'whatsapp', 'sms')
     */
    get channel() {
        throw new Error('NotificationProvider channel getter must be implemented');
    }

    /**
     * Send notification payload
     * @param {Object} options
     * @returns {Promise<{success: boolean, messageId?: string, provider: string, error?: string}>}
     */
    async send(options) {
        throw new Error('NotificationProvider send method must be implemented');
    }
}

module.exports = NotificationProvider;
