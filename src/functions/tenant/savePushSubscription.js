const AWS = require('aws-sdk');
const response = require('../../utils/response');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const TENANT_TABLE = process.env.TENANT_TABLE;
const USER_TABLE = process.env.USER_TABLE;

/**
 * POST /tenant/push-subscription
 * Saves Web Push PWA subscription details for a tenant or user.
 */
exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        const body = JSON.parse(event.body || '{}');
        const { subscription, tenantId, preferences } = body;

        if (!subscription || !subscription.endpoint) {
            return response.error('Valid push subscription object with endpoint is required', 400);
        }

        const targetTenantId = tenantId || dbUser.tenantId || dbUser.userId;
        if (!targetTenantId) {
            return response.error('Tenant ID missing', 400);
        }

        // Fetch target tenant record
        const tenantRes = await dynamodb.get({
            TableName: TENANT_TABLE,
            Key: { tenantId: targetTenantId }
        }).promise();

        if (tenantRes.Item) {
            const currentSubs = tenantRes.Item.pushSubscriptions || [];
            // De-duplicate subscription by endpoint
            const updatedSubs = currentSubs.filter(s => s.endpoint !== subscription.endpoint);
            updatedSubs.push({
                endpoint: subscription.endpoint,
                keys: subscription.keys || {},
                userAgent: event.headers?.['user-agent'] || 'Browser PWA',
                createdAt: new Date().toISOString()
            });

            const updateParams = {
                TableName: TENANT_TABLE,
                Key: { tenantId: targetTenantId },
                UpdateExpression: 'SET pushSubscriptions = :subs, notificationPreferences = :prefs, updatedAt = :uAt',
                ExpressionAttributeValues: {
                    ':subs': updatedSubs,
                    ':prefs': preferences || tenantRes.Item.notificationPreferences || { email: true, push: true },
                    ':uAt': new Date().toISOString()
                }
            };
            await dynamodb.update(updateParams).promise();
        }

        // Also attempt user table update if cognito / user entry exists
        try {
            await dynamodb.update({
                TableName: USER_TABLE,
                Key: { userId: dbUser.userId },
                UpdateExpression: 'SET pushSubscription = :sub, notificationPreferences = :prefs',
                ExpressionAttributeValues: {
                    ':sub': subscription,
                    ':prefs': preferences || { email: true, push: true }
                }
            }).promise();
        } catch (_) {}

        return response.success({
            message: 'PWA Push notification subscription registered successfully',
            registered: true
        });

    } catch (err) {
        console.error('[savePushSubscription] Error:', err);
        return response.error('Failed to register push subscription', 500);
    }
};
