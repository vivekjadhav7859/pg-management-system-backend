/**
 * NotificationService - Core orchestrator for GoBanqo notifications.
 * Decouples business modules from specific communication providers.
 */
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const SESProvider = require('../providers/email/sesProvider');
const emailTemplates = require('../templates/emailTemplates');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const EMAIL_LOG_TABLE = process.env.EMAIL_LOG_TABLE;

class NotificationService {
    constructor() {
        this.emailProvider = new SESProvider();
    }

    /**
     * Dispatch notification by event type
     */
    async sendNotification({ type, ownerId, tenantId, tenantEmail, recipientEmail, replyTo, data = {}, propertyId }) {
        const targetEmail = tenantEmail || recipientEmail;
        if (!targetEmail) {
            return { sent: false, reason: 'Recipient email address missing' };
        }

        let templateResult;
        switch (type) {
            case 'RENT_REMINDER':
                templateResult = emailTemplates.getRentReminderTemplate(data);
                break;
            case 'OVERDUE_REMINDER':
                templateResult = emailTemplates.getOverdueReminderTemplate(data);
                break;
            case 'PAYMENT_RECEIPT':
                templateResult = emailTemplates.getPaymentReceiptTemplate(data);
                break;
            case 'WELCOME':
                templateResult = emailTemplates.getWelcomeTemplate(data);
                break;
            case 'TENANT_REQUEST_ALERT':
                templateResult = emailTemplates.getTenantRequestAlertTemplate(data);
                break;
            case 'BROADCAST':
                templateResult = emailTemplates.getBroadcastTemplate(data);
                break;
            default:
                return { sent: false, reason: `Unsupported notification type: ${type}` };
        }

        const { subject, html } = templateResult;
        const senderDisplay = data.propertyName ? `"${data.propertyName} via GoBanqo" <noreply@gobanqo.com>` : null;

        const result = await this.emailProvider.sendEmail({
            to: targetEmail,
            from: senderDisplay,
            replyTo,
            subject,
            html,
            tags: [
                { name: 'NotificationType', value: type },
                { name: 'PropertyId', value: propertyId || 'default' }
            ]
        });

        // Log notification entry
        const status = result.success ? 'SENT' : 'FAILED';
        const logId = uuidv4();
        await this.logNotification({
            logId,
            ownerId: ownerId || 'system',
            tenantId: tenantId || '',
            tenantEmail: targetEmail,
            propertyId: propertyId || data.propertyId || '',
            type,
            subject,
            status,
            messageId: result.messageId || null,
            errorMessage: result.error || null,
            sentAt: new Date().toISOString()
        });

        return {
            sent: result.success,
            logId,
            messageId: result.messageId,
            reason: result.error
        };
    }

    /**
     * Store email log entry in DynamoDB
     */
    async logNotification(logItem) {
        if (!EMAIL_LOG_TABLE) return;
        try {
            await dynamodb.put({
                TableName: EMAIL_LOG_TABLE,
                Item: {
                    ...logItem,
                    ownerIdIndex: logItem.ownerId || 'system'
                }
            }).promise();
        } catch (err) {
            console.error('[NotificationService.logNotification] Error logging notification:', err);
        }
    }

    /**
     * Query notification logs for an owner with optional propertyId filter
     */
    async getLogsByOwner(ownerId, limit = 50, lastEvaluatedKey = null) {
        if (!EMAIL_LOG_TABLE) return { logs: [], lastEvaluatedKey: null };
        try {
            const params = {
                TableName: EMAIL_LOG_TABLE,
                IndexName: 'OwnerIdIndex',
                KeyConditionExpression: 'ownerIdIndex = :oid',
                ExpressionAttributeValues: { ':oid': ownerId },
                Limit: limit,
                ScanIndexForward: false // newest first
            };
            if (lastEvaluatedKey) {
                params.ExclusiveStartKey = lastEvaluatedKey;
            }
            const result = await dynamodb.query(params).promise();
            return {
                logs: result.Items || [],
                lastEvaluatedKey: result.LastEvaluatedKey || null
            };
        } catch (err) {
            console.error('[NotificationService.getLogsByOwner] Query error:', err);
            return { logs: [], lastEvaluatedKey: null };
        }
    }

    /**
     * Update notification log delivery status (from SNS webhook)
     */
    async updateLogStatus(messageId, status, details = null) {
        if (!EMAIL_LOG_TABLE || !messageId) return;
        try {
            // Find item by messageId or query index if added
            // For now, scan or query table for messageId
            const scanResult = await dynamodb.scan({
                TableName: EMAIL_LOG_TABLE,
                FilterExpression: 'messageId = :mid',
                ExpressionAttributeValues: { ':mid': messageId }
            }).promise();

            if (scanResult.Items && scanResult.Items.length > 0) {
                const log = scanResult.Items[0];
                await dynamodb.update({
                    TableName: EMAIL_LOG_TABLE,
                    Key: { logId: log.logId },
                    UpdateExpression: 'SET #st = :st, eventDetails = :det, updatedAt = :uAt',
                    ExpressionAttributeNames: { '#st': 'status' },
                    ExpressionAttributeValues: {
                        ':st': status,
                        ':det': details || null,
                        ':uAt': new Date().toISOString()
                    }
                }).promise();
            }
        } catch (err) {
            console.error('[NotificationService.updateLogStatus] Error:', err);
        }
    }
}

module.exports = new NotificationService();
