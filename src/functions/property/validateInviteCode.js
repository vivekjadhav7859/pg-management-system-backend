const AWS = require('aws-sdk');
const response = require('../../utils/response');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const body = JSON.parse(event.body || '{}');
        const code = (body.code || '').trim().toUpperCase();

        if (!code || code.length !== 8) {
            return response.error('Invalid code format', 400);
        }

        // Look up code in GSI
        const result = await dynamodb.query({
            TableName: process.env.INVITE_CODE_TABLE,
            IndexName: 'CodeIndex',
            KeyConditionExpression: 'code = :c',
            ExpressionAttributeValues: { ':c': code },
        }).promise();

        if (!result.Items || result.Items.length === 0) {
            return response.error('Invalid invite code', 404);
        }

        const invite = result.Items[0];
        const { notifyOwnerLinkExpired } = require('../../utils/expiredLinkAlert');

        // Legacy code auto-heal: if expiresAt missing, default to 90 days from now
        if (!invite.expiresAt) {
            const NinetyDaysMs = 90 * 24 * 60 * 60 * 1000;
            const newExpiry = new Date(Date.now() + NinetyDaysMs).toISOString();
            invite.expiresAt = newExpiry;
            dynamodb.update({
                TableName: process.env.INVITE_CODE_TABLE,
                Key: { propertyId: invite.propertyId },
                UpdateExpression: 'SET expiresAt = :exp, status = :st, updatedAt = :ts',
                ExpressionAttributeValues: {
                    ':exp': newExpiry,
                    ':st': 'active',
                    ':ts': new Date().toISOString(),
                },
            }).promise().catch((e) => console.warn('[validateInviteCode] legacy code update warning:', e.message));
        }

        if (invite.expiresAt && new Date() > new Date(invite.expiresAt)) {
            await notifyOwnerLinkExpired({
                ownerId: invite.ownerId,
                propertyId: invite.propertyId,
                propertyName: invite.propertyName,
                code: invite.code,
                linkType: 'property_invite',
            });
            return response.error('Property invitation code has expired after 3 months. The owner has been notified.', 410, { code: 'LINK_EXPIRED' });
        }

        return response.success({
            valid: true,
            propertyId: invite.propertyId,
            propertyName: invite.propertyName,
            ownerId: invite.ownerId,
            expiresAt: invite.expiresAt,
        });
    } catch (err) {
        console.error('[validateInviteCode]', err);
        return response.error(err.message || 'Internal server error', 500);
    }
};
