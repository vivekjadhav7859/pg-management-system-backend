const AWS = require('aws-sdk');
const response = require('../../utils/response');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can bulk delete requests', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        const body = JSON.parse(event.body || '{}');
        const { requestIds } = body;

        if (!Array.isArray(requestIds) || requestIds.length === 0) {
            return response.error('Array of requestIds is required', 400);
        }

        const deletedList = [];
        const failedList = [];

        for (const requestId of requestIds) {
            try {
                const existing = await dynamodb.get({
                    TableName: process.env.NOTIFICATION_TABLE,
                    Key: { id: requestId },
                }).promise();

                const request = existing.Item;
                if (!request) {
                    failedList.push({ requestId, reason: 'Request not found or already deleted' });
                    continue;
                }

                if (request.userIdIndex !== dbUser.userId && dbUser.userType !== 'admin') {
                    failedList.push({ requestId, reason: 'Unauthorized access to this request' });
                    continue;
                }

                await dynamodb.delete({
                    TableName: process.env.NOTIFICATION_TABLE,
                    Key: { id: requestId },
                }).promise();

                deletedList.push({
                    requestId,
                    title: request.title || 'Request',
                    tenantName: request.tenantName || request.tenantEmail || '',
                });

            } catch (itemErr) {
                console.error(`[bulkDeleteRequests] Failed for requestId ${requestId}:`, itemErr);
                failedList.push({ requestId, reason: itemErr.message || 'Deletion failed' });
            }
        }

        return response.success({
            message: `Bulk deletion complete. ${deletedList.length} deleted, ${failedList.length} failed.`,
            deletedCount: deletedList.length,
            failedCount: failedList.length,
            deleted: deletedList,
            failed: failedList,
        });

    } catch (err) {
        console.error('[bulkDeleteRequests]', err);
        return response.error(err.message || 'Failed to bulk delete requests', 500);
    }
};
