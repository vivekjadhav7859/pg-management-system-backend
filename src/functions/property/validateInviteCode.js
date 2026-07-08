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

        return response.success({
            valid: true,
            propertyId: invite.propertyId,
            propertyName: invite.propertyName,
            ownerId: invite.ownerId,
        });
    } catch (err) {
        console.error('[validateInviteCode]', err);
        return response.error(err.message || 'Internal server error', 500);
    }
};
