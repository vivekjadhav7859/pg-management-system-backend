const AWS = require('aws-sdk');
const response = require('../../utils/response');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');

const dynamodb = new AWS.DynamoDB.DocumentClient();

// Generate 8-char alphanumeric code — readable, no ambiguous chars (0/O, 1/I)
function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 8 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join('');
}

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const { userId, userType } = event.requestContext.authorizer;
        if (userType !== 'owner' && userType !== 'admin') {
            return response.error('Forbidden', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        const { propertyId } = event.pathParameters || {};
        if (!propertyId) return response.error('propertyId required', 400);

        // Verify owner owns this property
        const propResult = await dynamodb.get({
            TableName: process.env.PROPERTY_TABLE,
            Key: { propertyId },
        }).promise();
        const property = propResult.Item;
        if (!property) return response.error('Property not found', 404);
        if (property.ownerId !== userId && userType !== 'admin') {
            return response.error('Forbidden — not your property', 403);
        }

        // Check if code already exists for this property
        const existing = await dynamodb.get({
            TableName: process.env.INVITE_CODE_TABLE,
            Key: { propertyId },
        }).promise();

        const NinetyDaysMs = 90 * 24 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + NinetyDaysMs).toISOString();

        if (existing.Item) {
            const isExpired = existing.Item.expiresAt && new Date() > new Date(existing.Item.expiresAt);
            if (!existing.Item.expiresAt || isExpired) {
                await dynamodb.update({
                    TableName: process.env.INVITE_CODE_TABLE,
                    Key: { propertyId },
                    UpdateExpression: 'SET expiresAt = :exp, status = :st, updatedAt = :ts',
                    ExpressionAttributeValues: {
                        ':exp': expiresAt,
                        ':st': 'active',
                        ':ts': new Date().toISOString(),
                    },
                }).promise();
                existing.Item.expiresAt = expiresAt;
            }

            return response.success({
                code: existing.Item.code,
                propertyId,
                propertyName: property.propertyName,
                expiresAt: existing.Item.expiresAt || expiresAt,
                alreadyExisted: true,
            });
        }

        // Generate new unique code with collision check
        let code;
        let collision = true;
        while (collision) {
            code = generateCode();
            const check = await dynamodb.query({
                TableName: process.env.INVITE_CODE_TABLE,
                IndexName: 'CodeIndex',
                KeyConditionExpression: 'code = :c',
                ExpressionAttributeValues: { ':c': code },
            }).promise();
            collision = check.Items && check.Items.length > 0;
        }

        const item = {
            propertyId,
            code,
            ownerId: userId,
            propertyName: property.propertyName,
            status: 'active',
            createdAt: new Date().toISOString(),
            expiresAt,
        };

        await dynamodb.put({
            TableName: process.env.INVITE_CODE_TABLE,
            Item: item,
        }).promise();

        return response.success({ code, propertyId, propertyName: property.propertyName, expiresAt });
    } catch (err) {
        console.error('[generateInviteCode]', err);
        return response.error(err.message || 'Internal server error', 500);
    }
};
