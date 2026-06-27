const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const response = require('../../utils/response');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const VALID_STATUSES = ['approved', 'rejected', 'in_progress', 'resolved', 'closed'];

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can update requests', 403);
        }

        const requestId = event.pathParameters?.requestId;
        const body = JSON.parse(event.body || '{}');
        const { status, notes, assignedVendor, finalSettlement, refundAmount, nocIssued } = body;

        if (!requestId || !VALID_STATUSES.includes(status)) {
            return response.error('Valid requestId and status are required', 400);
        }

        const existing = await dynamodb.get({
            TableName: process.env.NOTIFICATION_TABLE,
            Key: { id: requestId },
        }).promise();

        const request = existing.Item;
        if (!request) return response.error('Request not found', 404);
        if (request.userIdIndex !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('Unauthorized to update this request', 403);
        }

        const timestamp = new Date().toISOString();
        const update = {
            TableName: process.env.NOTIFICATION_TABLE,
            Key: { id: requestId },
            UpdateExpression: [
                'SET requestStatus = :status',
                'updatedAt = :updatedAt',
                '#read = :read',
                'statusNotes = :notes',
                'assignedVendor = :assignedVendor',
                'finalSettlement = :finalSettlement',
                'refundAmount = :refundAmount',
                'nocIssued = :nocIssued',
            ].join(', '),
            ExpressionAttributeNames: { '#read': 'read' },
            ExpressionAttributeValues: {
                ':status': status,
                ':updatedAt': timestamp,
                ':read': true,
                ':notes': notes || '',
                ':assignedVendor': assignedVendor || null,
                ':finalSettlement': finalSettlement || null,
                ':refundAmount': refundAmount !== undefined ? Number(refundAmount) : null,
                ':nocIssued': Boolean(nocIssued),
            },
            ReturnValues: 'ALL_NEW',
        };

        const updated = await dynamodb.update(update).promise();

        if (request.tenantUserId) {
            await dynamodb.put({
                TableName: process.env.NOTIFICATION_TABLE,
                Item: {
                    id: uuidv4(),
                    userIdIndex: request.tenantUserId,
                    propertyIdIndex: request.propertyIdIndex,
                    type: 'Request Update',
                    title: `${request.title || 'Request'} ${status.replace(/_/g, ' ')}`,
                    description: notes || `Your request status is now ${status.replace(/_/g, ' ')}.`,
                    entityId: requestId,
                    entityType: request.entityType || 'request',
                    read: false,
                    requestStatus: status,
                    createdAt: timestamp,
                    createdAtIndex: timestamp,
                },
            }).promise();
        }

        return response.success({
            message: 'Request updated successfully',
            request: updated.Attributes,
        });
    } catch (err) {
        console.error('[updateRequestStatus]', err);
        return response.error('Failed to update request', 500);
    }
};
