/**
 * SESProvider - AWS SES Email Provider implementation extending NotificationProvider.
 */
const AWS = require('aws-sdk');
const NotificationProvider = require('../notificationProvider');

class SESProvider extends NotificationProvider {
    constructor() {
        super();
        this.region = process.env.SES_REGION || process.env.AWS_REGION || 'ap-south-1';
        this.ses = new AWS.SES({ region: this.region });
        this.fromEmail = process.env.SES_FROM_EMAIL || 'noreply@gobanqo.com';
    }

    get channel() {
        return 'email';
    }

    /**
     * Sanitize header strings to prevent email header injection
     */
    sanitizeHeader(value) {
        if (!value) return '';
        return String(value).replace(/[\r\n]/g, '').trim();
    }

    /**
     * Send email via AWS SES
     */
    async send({ to, from, replyTo, subject, html, text, tags = [] }) {
        const targetAddress = Array.isArray(to) ? to : [to];
        const cleanRecipients = targetAddress.map(addr => this.sanitizeHeader(addr)).filter(Boolean);

        if (cleanRecipients.length === 0) {
            return {
                success: false,
                error: 'No valid recipient email address provided',
                provider: 'ses'
            };
        }

        const senderDisplay = from 
            ? this.sanitizeHeader(from)
            : `"GoBanqo Notifications" <${this.fromEmail}>`;

        const cleanSubject = this.sanitizeHeader(subject || 'GoBanqo Notification');

        const params = {
            Source: senderDisplay,
            Destination: {
                ToAddresses: cleanRecipients
            },
            Message: {
                Subject: {
                    Data: cleanSubject,
                    Charset: 'UTF-8'
                },
                Body: {
                    Html: {
                        Data: html || '',
                        Charset: 'UTF-8'
                    }
                }
            }
        };

        if (text) {
            params.Message.Body.Text = {
                Data: text,
                Charset: 'UTF-8'
            };
        }

        if (replyTo) {
            const cleanReplyTo = Array.isArray(replyTo) 
                ? replyTo.map(r => this.sanitizeHeader(r)).filter(Boolean)
                : [this.sanitizeHeader(replyTo)].filter(Boolean);
            if (cleanReplyTo.length > 0) {
                params.ReplyToAddresses = cleanReplyTo;
            }
        }

        if (tags && tags.length > 0) {
            params.Tags = tags.map(tag => ({
                Name: String(tag.name).replace(/[^a-zA-Z0-9_-]/g, ''),
                Value: String(tag.value).replace(/[^a-zA-Z0-9_:-]/g, '')
            }));
        }

        try {
            const result = await this.ses.sendEmail(params).promise();
            return {
                success: true,
                messageId: result.MessageId,
                provider: 'ses'
            };
        } catch (error) {
            console.error('[SESProvider] sendEmail error:', error.message);

            // Handle AWS SES Sandbox mode during dev / test
            const stage = process.env.STAGE || 'dev';
            if (stage === 'dev' || process.env.NODE_ENV !== 'production') {
                if (error.code === 'MessageRejected' && error.message && error.message.includes('not verified')) {
                    const recipientStr = cleanRecipients.join(', ');
                    console.warn(`[SESProvider] DEV FALLBACK: AWS SES Sandbox blocked unverified email (${recipientStr}). Simulating delivery.`);
                    return {
                        success: true,
                        messageId: `dev-sandbox-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                        provider: 'ses-sandbox-simulated',
                        warning: 'AWS SES Sandbox mode active: Sender domain or recipient address unverified in AWS Console.'
                    };
                }
            }

            return {
                success: false,
                error: error.message || 'SES send email failed',
                provider: 'ses'
            };
        }
    }
}

module.exports = SESProvider;
