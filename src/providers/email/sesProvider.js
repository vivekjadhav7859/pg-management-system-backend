/**
 * SESProvider - AWS SES Email Provider implementation.
 */
const AWS = require('aws-sdk');

class SESProvider {
    constructor() {
        this.region = process.env.SES_REGION || process.env.AWS_REGION || 'ap-south-1';
        this.ses = new AWS.SES({ region: this.region });
        this.fromEmail = process.env.SES_FROM_EMAIL || 'noreply@gobanqo.com';
    }

    /**
     * Send email via AWS SES
     */
    async sendEmail({ to, from, replyTo, subject, html, text, tags = [] }) {
        const sender = from || `GoBanqo Notifications <${this.fromEmail}>`;
        
        const params = {
            Source: sender,
            Destination: {
                ToAddresses: Array.isArray(to) ? to : [to]
            },
            Message: {
                Subject: {
                    Data: subject,
                    Charset: 'UTF-8'
                },
                Body: {
                    Html: {
                        Data: html,
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
            params.ReplyToAddresses = Array.isArray(replyTo) ? replyTo : [replyTo];
        }

        if (tags && tags.length > 0) {
            params.Tags = tags.map(tag => ({
                Name: tag.name,
                Value: tag.value
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

            // Handle AWS SES Sandbox / Unverified Domain mode during development
            const stage = process.env.STAGE || 'dev';
            if (stage === 'dev' || process.env.NODE_ENV !== 'production') {
                if (error.code === 'MessageRejected' && error.message.includes('not verified')) {
                    const recipientStr = Array.isArray(to) ? to.join(', ') : to;
                    console.warn(`[SESProvider] DEV FALLBACK: AWS SES Sandbox blocked unverified email (${recipientStr}). Simulating successful dispatch.`);
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
