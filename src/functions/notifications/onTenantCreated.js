const AWS = require('aws-sdk');
const propertyService = require('../../services/property.service');
const notificationService = require('../../services/notification.service');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const USER_TABLE = process.env.USER_TABLE;

/**
 * DynamoDB Stream trigger on TenantsTable — INSERT events only.
 * Sends a welcome email to the new tenant using AWS SES platform.
 */
exports.handler = async (event) => {
    console.log('[onTenantCreated] records:', event.Records ? event.Records.length : 0);

    if (!event.Records || !Array.isArray(event.Records)) {
        return;
    }

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

            // Fetch owner details and tenant user details
            let ownerName = property.propertyName;
            let ownerContact = '';
            let ownerEmail = undefined;
            try {
                const ownerResult = await dynamodb.get({ TableName: USER_TABLE, Key: { userId: property.ownerId } }).promise();
                if (ownerResult.Item) {
                    ownerName = ownerResult.Item.name || ownerName;
                    ownerContact = ownerResult.Item.phoneNumber || '';
                    ownerEmail = ownerResult.Item.email || undefined;
                }
            } catch (_) {}

            let tenantUser = null;
            if (tenant.userId && USER_TABLE) {
                try {
                    const userResult = await dynamodb.get({ TableName: USER_TABLE, Key: { userId: tenant.userId } }).promise();
                    if (userResult.Item) {
                        tenantUser = userResult.Item;
                    }
                } catch (_) {}
            }

            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const isPendingActivation = tenantUser && (tenantUser.status === 'pending_activation' || tenantUser.invitationStatus === 'sent');
            const loginUrl = `${frontendUrl}/login`;
            const onboardingUrl = isPendingActivation ? `${frontendUrl}/activate` : `${frontendUrl}/tenant/dashboard`;

            const result = await notificationService.sendNotification({
                type: 'WELCOME',
                ownerId: property.ownerId,
                tenantId: tenant.tenantId,
                tenantEmail: tenant.email,
                replyTo: ownerEmail,
                propertyId: property.propertyId,
                data: {
                    tenantName: tenant.name || 'Tenant',
                    ownerName,
                    propertyName: property.propertyName,
                    roomNumber: tenant.roomNumber || '',
                    bedNumber: tenant.bedNumber || '',
                    ownerContact,
                    rentAmount: tenant.rentAmount || 0,
                    rentDueDay: tenant.rentDueDay || null,
                    leaseEndDate: tenant.leaseEndDate || null,
                    rules: property.rules || [],
                    frontendUrl,
                    loginUrl,
                    onboardingUrl: isPendingActivation ? onboardingUrl : undefined
                }
            });

            if (result.sent) {
                console.log('[onTenantCreated] welcome email sent to', tenant.email);
            } else {
                console.warn('[onTenantCreated] welcome email failed for', tenant.email, result.reason);
            }

        } catch (err) {
            // Never fail stream processing — just log
            console.error('[onTenantCreated] error for tenant', tenant.tenantId, err.message);
        }
    }
};
