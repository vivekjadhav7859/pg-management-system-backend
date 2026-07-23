/**
 * NotificationService - Core enterprise orchestrator for GoBanqo notifications.
 * Decouples business modules from specific communication providers.
 */
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const SESProvider = require('../providers/email/sesProvider');
const WebPushProvider = require('../providers/push/webPushProvider');
const emailTemplates = require('../templates/emailTemplates');
const { NOTIFICATION_EVENTS } = require('../constants/notificationEvents');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const EMAIL_LOG_TABLE = process.env.EMAIL_LOG_TABLE;
const REMINDER_SETTINGS_TABLE = process.env.REMINDER_SETTINGS_TABLE;

class NotificationService {
    constructor() {
        this.emailProvider = new SESProvider();
        this.pushProvider = new WebPushProvider();
    }

    /**
     * Check if notification type is enabled for a given property
     */
    async isEventEnabledForProperty(propertyId, type) {
        if (!propertyId || !REMINDER_SETTINGS_TABLE) return true;
        try {
            const res = await dynamodb.get({
                TableName: REMINDER_SETTINGS_TABLE,
                Key: { propertyId }
            }).promise();

            if (!res.Item) return true;

            const settings = res.Item;
            if (settings.autoEnabled === false) return false;

            if (type === NOTIFICATION_EVENTS.WELCOME || type === NOTIFICATION_EVENTS.TENANT_CREATED) {
                return settings.welcomeEnabled !== false;
            }
            if (type === NOTIFICATION_EVENTS.RENT_REMINDER || type === NOTIFICATION_EVENTS.RENT_DUE) {
                return settings.rentReminderEnabled !== false;
            }
            if (type === NOTIFICATION_EVENTS.RENT_OVERDUE || type === 'OVERDUE_REMINDER') {
                return settings.overdueEnabled !== false;
            }
            if (type === NOTIFICATION_EVENTS.RECEIPT_GENERATED || type === NOTIFICATION_EVENTS.PAYMENT_RECEIVED || type === 'PAYMENT_RECEIPT') {
                return settings.receiptEnabled !== false;
            }
            if (type === NOTIFICATION_EVENTS.COMPLAINT_CREATED || type === NOTIFICATION_EVENTS.COMPLAINT_UPDATED || type === 'TENANT_REQUEST_ALERT') {
                return settings.complaintUpdatesEnabled !== false;
            }

            return true;
        } catch (err) {
            console.error('[NotificationService.isEventEnabledForProperty] Error reading settings:', err);
            return true; // Default to allowing notification on error
        }
    }

    /**
     * Dispatch email notification by event type
     */
    async sendNotification({ type, ownerId, tenantId, tenantEmail, recipientEmail, replyTo, data = {}, propertyId, idempotencyKey = null }) {
        const targetEmail = tenantEmail || recipientEmail;
        if (!targetEmail) {
            return { sent: false, reason: 'Recipient email address missing' };
        }

        // Verify property preferences if applicable
        if (propertyId) {
            const enabled = await this.isEventEnabledForProperty(propertyId, type);
            if (!enabled) {
                console.log(`[NotificationService] Notification type ${type} disabled by owner for property ${propertyId}`);
                return { sent: false, reason: `Notification type ${type} disabled by property settings` };
            }
        }

        // Idempotency check if key provided
        if (idempotencyKey) {
            const alreadySent = await this.isIdempotentKeyDispatched(idempotencyKey);
            if (alreadySent) {
                console.log(`[NotificationService] Idempotency key ${idempotencyKey} already dispatched. Skipping.`);
                return { sent: true, skipped: true, reason: 'Idempotency lock active: Notification previously delivered' };
            }
        }

        let templateResult;
        switch (type) {
            // Auth
            case NOTIFICATION_EVENTS.ACCOUNT_CREATED:
                templateResult = emailTemplates.getAccountCreatedTemplate(data);
                break;
            case NOTIFICATION_EVENTS.EMAIL_VERIFIED:
                templateResult = emailTemplates.getEmailVerifiedTemplate(data);
                break;
            case NOTIFICATION_EVENTS.LOGIN_OTP:
                templateResult = emailTemplates.getLoginOtpTemplate(data);
                break;
            case NOTIFICATION_EVENTS.PASSWORD_RESET:
                templateResult = emailTemplates.getPasswordResetTemplate(data);
                break;
            case NOTIFICATION_EVENTS.PASSWORD_CHANGED:
                templateResult = emailTemplates.getPasswordChangedTemplate(data);
                break;

            // Tenant
            case NOTIFICATION_EVENTS.TENANT_CREATED:
            case 'WELCOME':
                templateResult = emailTemplates.getWelcomeTemplate(data);
                break;
            case NOTIFICATION_EVENTS.TENANT_ASSIGNED:
            case NOTIFICATION_EVENTS.ROOM_ASSIGNED:
                templateResult = emailTemplates.getTenantAssignedTemplate(data);
                break;
            case NOTIFICATION_EVENTS.TENANT_MOVED:
            case NOTIFICATION_EVENTS.ROOM_CHANGED:
                templateResult = emailTemplates.getTenantMovedTemplate(data);
                break;
            case NOTIFICATION_EVENTS.TENANT_CHECKOUT:
                templateResult = emailTemplates.getTenantCheckoutTemplate(data);
                break;

            // Rent
            case NOTIFICATION_EVENTS.RENT_REMINDER:
                templateResult = emailTemplates.getRentReminderTemplate(data);
                break;
            case NOTIFICATION_EVENTS.RENT_DUE:
                templateResult = emailTemplates.getRentDueTemplate(data);
                break;
            case NOTIFICATION_EVENTS.RENT_OVERDUE:
            case 'OVERDUE_REMINDER':
                templateResult = emailTemplates.getOverdueReminderTemplate(data);
                break;

            // Payment
            case NOTIFICATION_EVENTS.PAYMENT_RECEIVED:
            case NOTIFICATION_EVENTS.RECEIPT_GENERATED:
            case 'PAYMENT_RECEIPT':
                templateResult = emailTemplates.getPaymentReceiptTemplate(data);
                break;
            case NOTIFICATION_EVENTS.PAYMENT_FAILED:
                templateResult = emailTemplates.getPaymentFailedTemplate(data);
                break;
            case NOTIFICATION_EVENTS.PAYMENT_PENDING:
                templateResult = emailTemplates.getPaymentPendingTemplate(data);
                break;

            // Maintenance
            case NOTIFICATION_EVENTS.COMPLAINT_CREATED:
            case 'TENANT_REQUEST_ALERT':
                templateResult = emailTemplates.getComplaintCreatedTemplate(data);
                break;
            case NOTIFICATION_EVENTS.COMPLAINT_UPDATED:
                templateResult = emailTemplates.getComplaintUpdatedTemplate(data);
                break;
            case NOTIFICATION_EVENTS.COMPLAINT_RESOLVED:
                templateResult = emailTemplates.getComplaintResolvedTemplate(data);
                break;

            // Subscription & Alerts
            case NOTIFICATION_EVENTS.PLAN_CHANGED:
                templateResult = emailTemplates.getPlanChangedTemplate(data);
                break;
            case NOTIFICATION_EVENTS.TRIAL_ENDING:
                templateResult = emailTemplates.getTrialEndingTemplate(data);
                break;
            case NOTIFICATION_EVENTS.SYSTEM_ALERT:
            case 'BROADCAST':
                templateResult = emailTemplates.getBroadcastTemplate(data);
                break;
            case 'OWNER_DAILY_SUMMARY':
                templateResult = emailTemplates.getOwnerDailySummaryTemplate(data);
                break;

            default:
                return { sent: false, reason: `Unsupported notification type: ${type}` };
        }

        const { subject, html } = templateResult;
        const senderDisplay = data.propertyName 
            ? `"${data.propertyName} via GoBanqo" <noreply@gobanqo.com>` 
            : null;

        const result = await this.emailProvider.send({
            to: targetEmail,
            from: senderDisplay,
            replyTo,
            subject,
            html,
            tags: [
                { name: 'NotificationType', value: String(type) },
                { name: 'PropertyId', value: String(propertyId || 'system') }
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
            channel: 'email',
            subject,
            status,
            idempotencyKey: idempotencyKey || null,
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
     * Dispatch Web Push Notification
     */
    async sendPushNotification({ ownerId, tenantId, propertyId, subscription, title, body, data = {}, idempotencyKey = null }) {
        if (!subscription) {
            return { sent: false, reason: 'Push subscription required' };
        }

        if (idempotencyKey) {
            const alreadySent = await this.isIdempotentKeyDispatched(idempotencyKey);
            if (alreadySent) {
                return { sent: true, skipped: true, reason: 'Idempotency lock active for Push' };
            }
        }

        const result = await this.pushProvider.send({
            subscription,
            title,
            body,
            data
        });

        const status = result.success ? 'SENT' : 'FAILED';
        const logId = uuidv4();
        await this.logNotification({
            logId,
            ownerId: ownerId || 'system',
            tenantId: tenantId || '',
            tenantEmail: 'PWA_PUSH',
            propertyId: propertyId || '',
            type: data.eventType || 'PUSH_NOTIFICATION',
            channel: 'push',
            subject: title,
            status,
            idempotencyKey: idempotencyKey || null,
            messageId: result.messageId || null,
            errorMessage: result.error || null,
            sentAt: new Date().toISOString()
        });

        return {
            sent: result.success,
            logId,
            messageId: result.messageId,
            expiredEndpoints: result.expiredEndpoints || []
        };
    }

    /**
     * Check if an idempotency key was previously dispatched
     */
    async isIdempotentKeyDispatched(idempotencyKey) {
        if (!EMAIL_LOG_TABLE || !idempotencyKey) return false;
        try {
            const res = await dynamodb.scan({
                TableName: EMAIL_LOG_TABLE,
                FilterExpression: 'idempotencyKey = :ikey AND #st = :sent',
                ExpressionAttributeNames: { '#st': 'status' },
                ExpressionAttributeValues: {
                    ':ikey': idempotencyKey,
                    ':sent': 'SENT'
                },
                Limit: 1
            }).promise();
            return res.Items && res.Items.length > 0;
        } catch (err) {
            console.error('[NotificationService.isIdempotentKeyDispatched] Scan error:', err.message);
            return false;
        }
    }

    /**
     * Store email/notification log entry in DynamoDB
     */
    async logNotification(logItem) {
        if (!EMAIL_LOG_TABLE) return;
        try {
            await dynamodb.put({
                TableName: EMAIL_LOG_TABLE,
                Item: {
                    ...logItem,
                    channel: logItem.channel || 'email',
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
