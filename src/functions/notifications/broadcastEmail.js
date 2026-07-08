const AWS = require('aws-sdk');
const tenantService = require('../../services/tenant.service');
const propertyService = require('../../services/property.service');
const financialService = require('../../services/financial.service');
const { buildTransporter, logEmail, delay, getBroadcastTemplate } = require('../../utils/emailHelper');
const response = require('../../utils/response');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const USER_TABLE = process.env.USER_TABLE;

/**
 * POST /notifications/broadcast
 * Owner-only. Sends a custom notice to all active tenants (optionally filtered by propertyId).
 */
exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const { userId, userType } = event.requestContext.authorizer;
        if (userType !== 'owner' && userType !== 'admin') {
            return response.error('Forbidden', 403);
        }

        const body = JSON.parse(event.body || '{}');
        const { subject, message, propertyId } = body;

        if (!subject || !subject.trim()) return response.error('subject is required', 400);
        if (!message || !message.trim()) return response.error('message is required', 400);
        if (subject.length > 150) return response.error('subject must be 150 characters or less', 400);
        if (message.length > 2000) return response.error('message must be 2000 characters or less', 400);

        // Fetch owner details
        const ownerResult = await dynamodb.get({ TableName: USER_TABLE, Key: { userId } }).promise();
        const owner = ownerResult.Item;
        if (!owner) return response.error('Owner not found', 404);
        const ownerName = owner.name || 'Property Manager';

        // Fetch properties for this owner
        let propertiesToProcess = [];
        if (propertyId) {
            const prop = await propertyService.getPropertyById(propertyId);
            if (!prop) return response.error('Property not found', 404);
            if (prop.ownerId !== userId && userType !== 'admin') return response.error('Forbidden', 403);
            propertiesToProcess = [prop];
        } else {
            const result = await propertyService.getPropertiesByOwner(userId);
            propertiesToProcess = result || [];
        }

        if (propertiesToProcess.length === 0) {
            return response.success({ sent: 0, failed: 0, total: 0, message: 'No properties found' });
        }

        let totalSent = 0;
        let totalFailed = 0;

        for (const prop of propertiesToProcess) {
            // Fetch active tenants for this property
            let allTenants = [];
            let lastKey = null;
            do {
                const result = await tenantService.getTenantsByProperty(prop.propertyId, 100, lastKey);
                const active = (result.tenants || []).filter(t => t.status === 'active' && t.email);
                allTenants = allTenants.concat(active);
                lastKey = result.lastEvaluatedKey || null;
            } while (lastKey);

            if (allTenants.length === 0) continue;

            // Get SMTP config for this property
            const reminderSettings = await financialService.getReminderSettings(prop.propertyId).catch(() => null);
            if (!reminderSettings || !reminderSettings.emailConfig) {
                console.log(`[broadcastEmail] no SMTP config for property ${prop.propertyId}`);
                for (const t of allTenants) {
                    await logEmail({ ownerId: userId, tenantId: t.tenantId, tenantEmail: t.email, type: 'BROADCAST', subject, status: 'FAILED', errorMessage: 'SMTP not configured' });
                    totalFailed++;
                }
                continue;
            }

            let transporter;
            try {
                transporter = await buildTransporter(reminderSettings.emailConfig);
            } catch (err) {
                console.error(`[broadcastEmail] transporter build failed ${prop.propertyId}`, err.message);
                totalFailed += allTenants.length;
                continue;
            }

            for (const tenant of allTenants) {
                const { subject: emailSubject, html } = getBroadcastTemplate({
                    ownerName,
                    propertyName: prop.propertyName,
                    customSubject: subject,
                    message,
                });
                try {
                    await transporter.sendMail({
                        from: `"${prop.propertyName}" <${reminderSettings.emailConfig.user}>`,
                        to: tenant.email,
                        subject: emailSubject,
                        html,
                    });
                    await logEmail({ ownerId: userId, tenantId: tenant.tenantId, tenantEmail: tenant.email, type: 'BROADCAST', subject: emailSubject, status: 'SENT' });
                    totalSent++;
                    console.log(`[broadcastEmail] sent to ${tenant.email}`);
                } catch (err) {
                    console.error(`[broadcastEmail] failed ${tenant.email}`, err.message);
                    await logEmail({ ownerId: userId, tenantId: tenant.tenantId, tenantEmail: tenant.email, type: 'BROADCAST', subject: emailSubject, status: 'FAILED', errorMessage: err.message });
                    totalFailed++;
                }
                await delay(1500);
            }
        }

        return response.success({ sent: totalSent, failed: totalFailed, total: totalSent + totalFailed });

    } catch (err) {
        console.error('[broadcastEmail]', err);
        return response.error('Failed to send broadcast', 500);
    }
};
