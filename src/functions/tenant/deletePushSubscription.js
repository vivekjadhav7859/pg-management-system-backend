const AWS = require('aws-sdk');
const response = require('../../utils/response');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const TENANT_TABLE = process.env.TENANT_TABLE;
const USER_TABLE = process.env.USER_TABLE;

/**
 * DELETE /tenant/push-subscription
 * Unsubscribes / removes a Web Push subscription endpoint for a tenant or user.
 */
exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        const body = JSON.parse(event.body || '{}');
        const { endpoint, tenantId } = body;

        if (!endpoint) {
            return response.error('Subscription endpoint is required', 400);
        }

        const targetTenantId = tenantId || dbUser.tenantId || dbUser.userId;
        if (!targetTenantId) {
            return response.error('Tenant ID missing', 400);
        }

        // Remove from TENANT_TABLE
        const tenantRes = await dynamodb.get({
            TableName: TENANT_TABLE,
            Key: { tenantId: targetTenantId }
        }).promise();

        if (tenantRes.Item && tenantRes.Item.pushSubscriptions) {
            const updatedSubs = tenantRes.Item.pushSubscriptions.filter(s => s.endpoint !== endpoint);
            await dynamodb.update({
                TableName: TENANT_TABLE,
                Key: { tenantId: targetTenantId },
                UpdateExpression: 'SET pushSubscriptions = :subs, updatedAt = :uAt',
                ExpressionAttributeValues: {
                    ':subs': updatedSubs,
                    ':uAt': new Date().toISOString()
                }
            }).promise();
        }

        // Also remove from USER_TABLE
        try {
            const userRes = await dynamodb.get({
                TableName: USER_TABLE,
                Key: { userId: dbUser.userId }
            }).promise();

            if (userRes.Item && userRes.Item.pushSubscription?.endpoint === endpoint) {
                await dynamodb.update({
                    TableName: USER_TABLE,
                    Key: { userId: dbUser.userId },
                    UpdateExpression: 'REMOVE pushSubscription'
                }).promise();
            }
        } catch (_) {}

        return response.success({
            message: 'Push subscription removed successfully',
            unsubscribed: true
        });

    } catch (err) {
        console.error('[deletePushSubscription] Error:', err);
        return response.error('Failed to remove push subscription', 500);
    }
};
