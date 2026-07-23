const notificationService = require('../../services/notification.service');

/**
 * SES Event Handler triggered via SNS Topic (Bounces, Complaints, Deliveries)
 */
exports.handler = async (event) => {
    console.log('[sesEventHandler] Received records count:', event.Records ? event.Records.length : 0);

    if (!event.Records || !Array.isArray(event.Records)) {
        return { statusCode: 200, body: 'No records to process' };
    }

    for (const record of event.Records) {
        try {
            let messageStr = record.Sns ? record.Sns.Message : record.body;
            if (!messageStr) continue;

            const message = typeof messageStr === 'string' ? JSON.parse(messageStr) : messageStr;
            const eventType = message.notificationType || message.eventType;
            const mail = message.mail;

            if (!mail || !mail.messageId) continue;

            const messageId = mail.messageId;

            if (eventType === 'Bounce') {
                const bounceType = message.bounce?.bounceType || 'Hard';
                const bounceSubType = message.bounce?.bounceSubType || '';
                console.warn(`[sesEventHandler] Bounce detected for message ${messageId}:`, bounceType, bounceSubType);
                await notificationService.updateLogStatus(messageId, 'BOUNCED', {
                    bounceType,
                    bounceSubType,
                    bouncedRecipients: message.bounce?.bouncedRecipients
                });
            } else if (eventType === 'Complaint') {
                console.warn(`[sesEventHandler] Complaint detected for message ${messageId}`);
                await notificationService.updateLogStatus(messageId, 'COMPLAINED', {
                    complaintFeedbackType: message.complaint?.complaintFeedbackType,
                    complainedRecipients: message.complaint?.complainedRecipients
                });
            } else if (eventType === 'Delivery') {
                console.log(`[sesEventHandler] Delivery confirmed for message ${messageId}`);
                await notificationService.updateLogStatus(messageId, 'DELIVERED', {
                    timestamp: message.delivery?.timestamp,
                    processingTimeMillis: message.delivery?.processingTimeMillis
                });
            }
        } catch (err) {
            console.error('[sesEventHandler] Record processing error:', err);
        }
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'Processed SES events' }) };
};
