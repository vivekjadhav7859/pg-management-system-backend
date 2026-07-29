const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Dispatch notification alert to property owner when an invitation link/code expires or an expired link is accessed.
 * Includes throttling lock to prevent duplicate alerts within 24 hours for the same code/tenant.
 */
exports.notifyOwnerLinkExpired = async ({
    ownerId,
    propertyId,
    propertyName,
    code,
    tenantName,
    tenantEmail,
    linkType = 'property_invite',
}) => {
    if (!ownerId || !process.env.NOTIFICATION_TABLE) return;

    try {
        const keyIdentifier = code || tenantEmail || 'code';
        const recentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Throttling check: check if an alert for this keyIdentifier was issued in the last 24h
        const existing = await dynamodb.query({
            TableName: process.env.NOTIFICATION_TABLE,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userIdIndex = :ownerId',
            FilterExpression: 'entityType = :entityType AND code = :code AND createdAt > :recent',
            ExpressionAttributeValues: {
                ':ownerId': ownerId,
                ':entityType': 'linkExpiredAlert',
                ':code': keyIdentifier,
                ':recent': recentThreshold,
            },
            Limit: 1,
        }).promise().catch(() => null);

        if (existing?.Items && existing.Items.length > 0) {
            console.log(`[expiredLinkAlert] Throttling active for owner ${ownerId}, code/email ${keyIdentifier}. Skipping alert.`);
            return;
        }

        const timestamp = new Date().toISOString();
        const requestId = uuidv4();
        let title = 'Property Invitation Code Expired';
        let description = `The self-service invitation code/link (${keyIdentifier}) for ${propertyName || 'your property'} has expired after 3 months. Please generate a new invite code in Property Settings.`;

        if (linkType === 'tenant_invitation') {
            title = 'Tenant Invitation Link Expired';
            const tenantInfo = tenantName ? `${tenantName} (${tenantEmail || ''})` : (tenantEmail || 'a tenant');
            description = `The single-use invitation link for ${tenantInfo} at ${propertyName || 'your property'} has expired after 3 months. Please resend the invitation from Tenant Management.`;
        }

        const ownerAlert = {
            id: requestId,
            userIdIndex: ownerId,
            propertyIdIndex: propertyId || '',
            propertyName: propertyName || '',
            type: title,
            title,
            description,
            entityId: requestId,
            entityType: 'linkExpiredAlert',
            code: keyIdentifier,
            read: false,
            requestStatus: 'expired',
            requestType: 'link_expired',
            createdAt: timestamp,
            createdAtIndex: timestamp,
        };

        await dynamodb.put({
            TableName: process.env.NOTIFICATION_TABLE,
            Item: ownerAlert,
        }).promise();

        console.log(`[expiredLinkAlert] Successfully recorded owner expiration alert for owner ${ownerId}`);
    } catch (err) {
        console.warn('[expiredLinkAlert] Non-critical failed to dispatch owner expiration alert:', err.message);
    }
};
