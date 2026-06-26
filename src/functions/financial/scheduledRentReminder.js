const AWS = require('aws-sdk');
const financialService = require('../../services/financial.service');
const propertyService = require('../../services/property.service');
const { buildTransporter, logEmail, delay, getRentReminderTemplate } = require('../../utils/emailHelper');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const TENANT_TABLE = process.env.TENANT_TABLE;
const USER_TABLE = process.env.USER_TABLE;

/**
 * Scheduled: 1st of every month at 9:00 AM IST (cron(30 3 1 * ? *))
 * Sends rent reminder emails to all active tenants across all owners.
 */
exports.handler = async (event) => {
    console.log('[scheduledRentReminder] triggered', JSON.stringify(event));

    // Scan all active tenants
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

    console.log(`[scheduledRentReminder] found ${tenants.length} active tenants`);

    // Group tenants by propertyId
    const byProperty = {};
    for (const t of tenants) {
        if (!t.propertyId) continue;
        if (!byProperty[t.propertyId]) byProperty[t.propertyId] = [];
        byProperty[t.propertyId].push(t);
    }

    const now = new Date();
    const dueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const dueDateDisplay = new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    let sent = 0;
    let failed = 0;

    for (const [propertyId, propertyTenants] of Object.entries(byProperty)) {
        // Fetch property details
        let property;
        try {
            property = await propertyService.getPropertyById(propertyId);
        } catch (err) {
            console.error(`[scheduledRentReminder] property fetch failed ${propertyId}`, err.message);
            continue;
        }
        if (!property) continue;

        // Fetch owner details
        let ownerName = property.propertyName;
        try {
            const ownerResult = await dynamodb.get({ TableName: USER_TABLE, Key: { userId: property.ownerId } }).promise();
            if (ownerResult.Item) ownerName = ownerResult.Item.name || ownerName;
        } catch (_) {}

        // Fetch SMTP config for this property
        const reminderSettings = await financialService.getReminderSettings(propertyId).catch(() => null);
        if (!reminderSettings || !reminderSettings.emailConfig) {
            console.log(`[scheduledRentReminder] no SMTP config for property ${propertyId}, skipping ${propertyTenants.length} tenants`);
            for (const t of propertyTenants) {
                if (!t.email) continue;
                await logEmail({ ownerId: property.ownerId, tenantId: t.tenantId, tenantEmail: t.email, type: 'RENT_REMINDER', subject: 'Rent Reminder', status: 'FAILED', errorMessage: 'SMTP not configured for property' });
                failed++;
            }
            continue;
        }

        let transporter;
        try {
            transporter = await buildTransporter(reminderSettings.emailConfig);
        } catch (err) {
            console.error(`[scheduledRentReminder] transporter build failed ${propertyId}`, err.message);
            failed += propertyTenants.length;
            continue;
        }

        for (const tenant of propertyTenants) {
            if (!tenant.email) { failed++; continue; }
            const { subject, html } = getRentReminderTemplate({
                tenantName: tenant.name || 'Tenant',
                ownerName,
                propertyName: property.propertyName,
                rentAmount: tenant.rentAmount || 0,
                dueDate: dueDateDisplay,
            });
            try {
                await transporter.sendMail({
                    from: `"${property.propertyName}" <${reminderSettings.emailConfig.user}>`,
                    to: tenant.email,
                    subject,
                    html,
                });
                await logEmail({ ownerId: property.ownerId, tenantId: tenant.tenantId, tenantEmail: tenant.email, type: 'RENT_REMINDER', subject, status: 'SENT' });
                sent++;
                console.log(`[scheduledRentReminder] sent to ${tenant.email}`);
            } catch (err) {
                console.error(`[scheduledRentReminder] send failed ${tenant.email}`, err.message);
                await logEmail({ ownerId: property.ownerId, tenantId: tenant.tenantId, tenantEmail: tenant.email, type: 'RENT_REMINDER', subject, status: 'FAILED', errorMessage: err.message });
                failed++;
            }
            await delay(1500);
        }
    }

    console.log(`[scheduledRentReminder] done — sent: ${sent}, failed: ${failed}`);
    return { sent, failed, total: sent + failed };
};
