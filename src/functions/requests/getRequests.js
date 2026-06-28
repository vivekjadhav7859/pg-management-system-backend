const AWS = require('aws-sdk');
const response = require('../../utils/response');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const REQUEST_ENTITY_TYPES = new Set(['bookingRequest', 'complaint', 'tenantJoinRequest']);

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can view requests', 403);
        }

        const result = await dynamodb.query({
            TableName: process.env.NOTIFICATION_TABLE,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userIdIndex = :userId',
            ExpressionAttributeValues: { ':userId': dbUser.userId },
            ScanIndexForward: false,
        }).promise();

        const requests = (result.Items || []).filter((item) => {
            if (REQUEST_ENTITY_TYPES.has(item.entityType) && item.requestStatus) return true;
            return ['Booking Request', 'Schedule Visit Request', 'Tenant Join Request', 'Check-out Request', 'Complaint Raised'].includes(item.type);
        }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

        return response.success({
            requests,
            count: requests.length,
        });
    } catch (err) {
        console.error('[getRequests]', err);
        return response.error('Failed to fetch requests', 500);
    }
};
