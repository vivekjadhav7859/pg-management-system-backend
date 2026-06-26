const AWS = require('aws-sdk');
const financialService = require('../../services/financial.service');
const propertyService = require('../../services/property.service');
const { buildTransporter, logEmail, getWelcomeTemplate } = require('../../utils/emailHelper');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const USER_TABLE = process.env.USER_TABLE;

/**
 * DynamoDB Stream trigger on TenantsTable — INSERT events only.
 * Sends a welcome email to the new tenant using the property's SMTP config.
 */
exports.handler = async (event) => {
    console.log('[onTenantCreated] records:', event.Records.length);

    for (const record of event.Records) {
        if (record.eventName !== 'INSERT') continue;

        const raw = record.dynamodb && record.dynamodb.NewImage;
        if (!raw) continue;

        // Unmarshal DynamoDB AttributeValue map
        const tenant = AWS.DynamoDB.Converter.unmarshall(raw);
        if (!tenant.email) {
            console.log('[onTenantCreated] tenant has no email, skipping', tenant.tenantId);
            continue;
        }

        try {
            const property = await propertyService.getPropertyById(tenant.propertyId);
            if (!property) {
                console.log('[onTenantCreated] property not found', tenant.propertyId);
                continue;
            }

            // Fetch owner details
            let ownerName = property.propertyName;
            let ownerContact = '';
            try {
                const ownerResult = await dynamodb.get({ TableName: USER_TABLE, Key: { userId: property.ownerId } }).promise();
                if (ownerResult.Item) {
                    ownerName = ownerResult.Item.name || ownerName;
                    ownerContact = ownerResult.Item.phoneNumber || '';
                }
            } catch (_) {}

            const reminderSettings = await financialService.getReminderSettings(property.propertyId).catch(() => null);
            if (!reminderSettings || !reminderSettings.emailConfig) {
                console.log('[onTenantCreated] no SMTP config for property', property.propertyId);
                await logEmail({ ownerId: property.ownerId, tenantId: tenant.tenantId, tenantEmail: tenant.email, type: 'WELCOME', subject: 'Welcome Email', status: 'FAILED', errorMessage: 'SMTP not configured' });
                continue;
            }

            const transporter = await buildTransporter(reminderSettings.emailConfig);
            const { subject, html } = getWelcomeTemplate({
                tenantName: tenant.name || 'Tenant',
                ownerName,
                propertyName: property.propertyName,
                ownerContact,
                rentAmount: tenant.rentAmount || 0,
                rentDueDay: tenant.rentDueDay || null,
                leaseEndDate: tenant.leaseEndDate || null,
                rules: property.rules || [],
            });

            await transporter.sendMail({
                from: `"${property.propertyName}" <${reminderSettings.emailConfig.user}>`,
                to: tenant.email,
                subject,
                html,
            });

            await logEmail({ ownerId: property.ownerId, tenantId: tenant.tenantId, tenantEmail: tenant.email, type: 'WELCOME', subject, status: 'SENT' });
            console.log('[onTenantCreated] welcome email sent to', tenant.email);

        } catch (err) {
            // Never fail stream processing — just log
            console.error('[onTenantCreated] error for tenant', tenant.tenantId, err.message);
            await logEmail({ ownerId: tenant.ownerId || 'unknown', tenantId: tenant.tenantId, tenantEmail: tenant.email, type: 'WELCOME', subject: 'Welcome Email', status: 'FAILED', errorMessage: err.message }).catch(() => {});
        }
    }
};
