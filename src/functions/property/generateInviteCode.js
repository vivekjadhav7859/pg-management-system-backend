const AWS = require('aws-sdk');
const response = require('../../utils/response');

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
        const { userId, userType } = event.requestContext.authorizer;
        if (userType !== 'owner' && userType !== 'admin') {
            return response.error('Forbidden', 403);
        }

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

        if (existing.Item) {
            return response.success({
                code: existing.Item.code,
                propertyId,
                propertyName: property.propertyName,
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
            createdAt: new Date().toISOString(),
        };

        await dynamodb.put({
            TableName: process.env.INVITE_CODE_TABLE,
            Item: item,
        }).promise();

        return response.success({ code, propertyId, propertyName: property.propertyName });
    } catch (err) {
        console.error('[generateInviteCode]', err);
        return response.error(err.message || 'Internal server error', 500);
    }
};
