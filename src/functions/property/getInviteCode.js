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

        return response.success({
            code: result.Item.code,
            propertyId: result.Item.propertyId,
            propertyName: result.Item.propertyName,
            exists: true,
        });
    } catch (err) {
        console.error('[getInviteCode]', err);
        return response.error(err.message || 'Internal server error', 500);
    }
};
