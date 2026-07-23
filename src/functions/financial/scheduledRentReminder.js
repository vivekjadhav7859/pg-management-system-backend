const AWS = require('aws-sdk');
const propertyService = require('../../services/property.service');
const notificationService = require('../../services/notification.service');
const subscriptionService = require('../../services/subscription.service');
const financialService = require('../../services/financial.service');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const TENANT_TABLE = process.env.TENANT_TABLE;
const USER_TABLE = process.env.USER_TABLE;
const RENT_PAYMENT_TABLE = process.env.RENT_PAYMENT_TABLE;

/**
 * Scheduled Cron Engine: Evaluates multi-schedule reminder rules across all properties daily.
 * Rules evaluated:
 * - Before Due Date (e.g. 3 days before, 1 day before)
 * - On Due Date (Rent Due Today)
 * - After Due Date / Overdue (e.g. 1 day overdue, 3 days overdue, 7 days overdue)
 * Enforces composite idempotency locks to eliminate duplicate dispatches across Email & Push channels.
 */
exports.handler = async (event) => {
    console.log('[scheduledRentReminderEngine] triggered', JSON.stringify(event));

    // Current date calculations in IST (UTC+5:30)
    const nowIST = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
    const todayStr = nowIST.toISOString().slice(0, 10); // YYYY-MM-DD

    // Scan active tenants
    let tenants = [];
    let lastKey = null;
    do {
        const params = {
            TableName: TENANT_TABLE,
            FilterExpression: '#st = :active',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: { ':active': 'active' },
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;
        const result = await dynamodb.scan(params).promise();
        tenants = tenants.concat(result.Items || []);
        lastKey = result.LastEvaluatedKey || null;
    } while (lastKey);

    console.log(`[scheduledRentReminderEngine] found ${tenants.length} active tenants`);

    // Group tenants by propertyId
    const byProperty = {};
    for (const t of tenants) {
        if (!t.propertyId) continue;
        if (!byProperty[t.propertyId]) byProperty[t.propertyId] = [];
        byProperty[t.propertyId].push(t);
    }

    let totalSent = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const [propertyId, propertyTenants] of Object.entries(byProperty)) {
        // Fetch property details
        let property;
        try {
            property = await propertyService.getPropertyById(propertyId);
        } catch (err) {
            console.error(`[scheduledRentReminderEngine] property fetch failed ${propertyId}`, err.message);
            continue;
        }
        if (!property) continue;

        // Subscription check
        try {
            await subscriptionService.assertOwnerWriteAccess(property.ownerId, { startTrial: false });
        } catch (error) {
            if (error instanceof subscriptionService.SubscriptionAccessError) {
                console.log(`[scheduledRentReminderEngine] subscription locked for owner ${property.ownerId}, skipping property ${propertyId}`);
                continue;
            }
            throw error;
        }

        // Fetch reminder settings for property
        const reminderSettings = await financialService.getReminderSettings(propertyId).catch(() => null);
        if (reminderSettings && reminderSettings.autoEnabled === false) {
            console.log(`[scheduledRentReminderEngine] auto reminders disabled for property ${propertyId}`);
            continue;
        }

        const daysBeforeSetting = reminderSettings?.daysBefore ? parseInt(reminderSettings.daysBefore, 10) : 3;
        const daysAfterSetting = reminderSettings?.daysAfter ? parseInt(reminderSettings.daysAfter, 10) : 2;

        // Fetch owner details
        let ownerName = property.propertyName;
        let ownerEmail = null;
        try {
            const ownerResult = await dynamodb.get({ TableName: USER_TABLE, Key: { userId: property.ownerId } }).promise();
            if (ownerResult.Item) {
                ownerName = ownerResult.Item.name || ownerName;
                ownerEmail = ownerResult.Item.email || null;
            }
        } catch (_) {}

        // Evaluate pending payments for each tenant
        for (const tenant of propertyTenants) {
            let pendingPayments = [];
            try {
                const payRes = await dynamodb.query({
                    TableName: RENT_PAYMENT_TABLE,
                    IndexName: 'TenantIdIndex',
                    KeyConditionExpression: 'tenantIdIndex = :tid',
                    FilterExpression: 'paymentStatus = :pstat OR paymentStatus = :ostat',
                    ExpressionAttributeValues: {
                        ':tid': tenant.tenantId,
                        ':pstat': 'pending',
                        ':ostat': 'overdue'
                    }
                }).promise();
                pendingPayments = payRes.Items || [];
            } catch (err) {
                console.error(`[scheduledRentReminderEngine] Failed to query payments for tenant ${tenant.tenantId}:`, err.message);
            }

            // Fallback synthetic payment if no database payment record exists yet for current month
            if (pendingPayments.length === 0) {
                const defaultDueDate = `${todayStr.slice(0, 7)}-05`; // 5th of current month
                pendingPayments.push({
                    paymentId: `syn-${tenant.tenantId}-${todayStr.slice(0, 7)}`,
                    amount: tenant.rentAmount || 0,
                    dueDate: defaultDueDate,
                    paymentStatus: 'pending'
                });
            }

            for (const payment of pendingPayments) {
                if (!payment.dueDate) continue;

                const dueDateObj = new Date(payment.dueDate);
                const todayObj = new Date(todayStr);
                const diffTime = todayObj.getTime() - dueDateObj.getTime();
                const diffDays = Math.round(diffTime / (1000 * 3600 * 24)); // negative = before due, 0 = on due, positive = overdue

                let ruleType = null;
                let eventType = null;

                if (diffDays === -daysBeforeSetting || diffDays === -1) {
                    ruleType = `BEFORE_DUE_${Math.abs(diffDays)}d`;
                    eventType = 'RENT_REMINDER';
                } else if (diffDays === 0) {
                    ruleType = 'DUE_TODAY';
                    eventType = 'RENT_DUE';
                } else if (diffDays === daysAfterSetting || diffDays === 1 || diffDays === 3 || diffDays === 7) {
                    ruleType = `OVERDUE_${diffDays}d`;
                    eventType = 'RENT_OVERDUE';
                }

                if (!ruleType || !eventType) continue;

                const formattedDueDate = dueDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                const templateData = {
                    tenantName: tenant.name || 'Tenant',
                    ownerName,
                    propertyName: property.propertyName,
                    roomNumber: tenant.roomId || 'N/A',
                    rentAmount: payment.amount || tenant.rentAmount || 0,
                    dueDate: formattedDueDate
                };

                // Channel 1: Email Notification
                if (tenant.email && tenant.notificationPreferences?.email !== false) {
                    const emailIdempotencyKey = `BILL_REMINDER#${payment.paymentId}#${ruleType}#EMAIL#${todayStr}`;
                    const emailRes = await notificationService.sendNotification({
                        type: eventType,
                        ownerId: property.ownerId,
                        tenantId: tenant.tenantId,
                        tenantEmail: tenant.email,
                        replyTo: ownerEmail || undefined,
                        propertyId,
                        data: templateData,
                        idempotencyKey: emailIdempotencyKey
                    });

                    if (emailRes.skipped) totalSkipped++;
                    else if (emailRes.sent) totalSent++;
                    else totalFailed++;
                }

                // Channel 2: PWA Web Push Notification
                if (tenant.pushSubscriptions && Array.isArray(tenant.pushSubscriptions) && tenant.pushSubscriptions.length > 0 && tenant.notificationPreferences?.push !== false) {
                    const pushIdempotencyKey = `BILL_REMINDER#${payment.paymentId}#${ruleType}#PUSH#${todayStr}`;
                    const pushTitle = eventType === 'RENT_OVERDUE' 
                        ? `⚠️ Rent Overdue Alert - ${property.propertyName}`
                        : `🔔 Rent Payment Reminder - ${property.propertyName}`;
                    const pushBody = `Hello ${tenant.name || 'Tenant'}, rent of ₹${(payment.amount || tenant.rentAmount || 0).toLocaleString('en-IN')} is ${diffDays > 0 ? `overdue by ${diffDays} days` : `due on ${formattedDueDate}`}.`;

                    const pushRes = await notificationService.sendPushNotification({
                        ownerId: property.ownerId,
                        tenantId: tenant.tenantId,
                        propertyId,
                        subscription: tenant.pushSubscriptions,
                        title: pushTitle,
                        body: pushBody,
                        data: {
                            url: '/tenant/dashboard',
                            paymentId: payment.paymentId,
                            eventType
                        },
                        idempotencyKey: pushIdempotencyKey
                    });

                    if (pushRes.skipped) totalSkipped++;
                    else if (pushRes.sent) totalSent++;
                    else totalFailed++;
                }
            }
        }
    }

    console.log(`[scheduledRentReminderEngine] Execution completed — Sent: ${totalSent}, Skipped (Idempotent): ${totalSkipped}, Failed: ${totalFailed}`);
    return { sent: totalSent, skipped: totalSkipped, failed: totalFailed };
};
