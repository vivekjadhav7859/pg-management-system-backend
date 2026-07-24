const AWS = require('aws-sdk');
const response = require('../../utils/response');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const { userId, userType } = event.requestContext.authorizer;
        if (userType !== 'owner' && userType !== 'admin') {
            return response.error('Forbidden', 403);
        }

        const { propertyId } = event.pathParameters || {};
        if (!propertyId) return response.error('propertyId required', 400);

        const result = await dynamodb.get({
            TableName: process.env.INVITE_CODE_TABLE,
            Key: { propertyId },
        }).promise();

        if (!result.Item) {
            return response.success({ code: null, exists: false });
        }

        const NinetyDaysMs = 90 * 24 * 60 * 60 * 1000;
        let expiresAt = result.Item.expiresAt;

        // Auto-default legacy codes missing expiresAt to 90 days from now
        if (!expiresAt) {
            expiresAt = new Date(Date.now() + NinetyDaysMs).toISOString();
            await dynamodb.update({
                TableName: process.env.INVITE_CODE_TABLE,
                Key: { propertyId },
                UpdateExpression: 'SET expiresAt = :exp, status = :st, updatedAt = :ts',
                ExpressionAttributeValues: {
                    ':exp': expiresAt,
                    ':st': 'active',
                    ':ts': new Date().toISOString(),
                },
            }).promise().catch((e) => console.warn('[getInviteCode] non-critical update legacy code error:', e.message));
        }

        const isExpired = expiresAt && new Date() > new Date(expiresAt);

        return response.success({
            code: result.Item.code,
            propertyId: result.Item.propertyId,
            propertyName: result.Item.propertyName,
            expiresAt,
            isExpired,
            exists: true,
        });
    } catch (err) {
        console.error('[getInviteCode]', err);
        return response.error(err.message || 'Internal server error', 500);
    }
};
