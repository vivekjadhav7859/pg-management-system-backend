const AWS = require('aws-sdk');
const response = require('../../utils/response');
const { sendOwnerRequestEmail } = require('../../utils/ownerRequestEmail');
const { createTenantJoinRequest } = require('../../utils/tenantJoinRequest');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        const { userId, userType } = event.requestContext.authorizer;

        // Only tenants can link
        if (userType !== 'tenant') {
            return response.error('Only tenants can use invite codes', 403);
        }

        const body = JSON.parse(event.body || '{}');
        const code = (body.code || '').trim().toUpperCase();

        if (!code || code.length !== 8) {
            return response.error('Invalid code format', 400);
        }

        // 1. Look up the invite code
        const codeResult = await dynamodb.query({
            TableName: process.env.INVITE_CODE_TABLE,
            IndexName: 'CodeIndex',
            KeyConditionExpression: 'code = :c',
            ExpressionAttributeValues: { ':c': code },
        }).promise();

        if (!codeResult.Items || codeResult.Items.length === 0) {
            return response.error('Invalid invite code', 404);
        }

        const invite = codeResult.Items[0];

        const [tenantUserResult, propertyResult, ownerResult] = await Promise.all([
            dynamodb.get({
                TableName: process.env.USER_TABLE,
                Key: { userId },
            }).promise(),
            dynamodb.get({
                TableName: process.env.PROPERTY_TABLE,
                Key: { propertyId: invite.propertyId },
            }).promise(),
            dynamodb.get({
                TableName: process.env.USER_TABLE,
                Key: { userId: invite.ownerId },
            }).promise(),
        ]);

        const tenantUser = tenantUserResult.Item || { userId };
        const property = propertyResult.Item || {
            propertyId: invite.propertyId,
            propertyName: invite.propertyName,
            ownerId: invite.ownerId,
        };
        const owner = ownerResult.Item || { userId: invite.ownerId };

        // 2. Check if this user already has an active tenant record for this property
        const tenantResult = await dynamodb.query({
            TableName: process.env.TENANT_TABLE,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userIdIndex = :uid',
            ExpressionAttributeValues: { ':uid': userId },
        }).promise();

        if (tenantResult.Items && tenantResult.Items.length > 0) {
            const alreadyLinked = tenantResult.Items.find(
                t => t.propertyId === invite.propertyId && t.status === 'active'
            );
            if (alreadyLinked) {
                return response.success({
                    message: 'Already linked to this property',
                    propertyId: invite.propertyId,
                    propertyName: invite.propertyName,
                    tenantId: alreadyLinked.tenantId,
                    alreadyLinked: true,
                });
            }
        }

        // 3. Update the Users table to store propertyId + ownerId
        await dynamodb.update({
            TableName: process.env.USER_TABLE,
            Key: { userId },
            UpdateExpression: 'SET linkedPropertyId = :pid, linkedOwnerId = :oid, updatedAt = :ts',
            ExpressionAttributeValues: {
                ':pid': invite.propertyId,
                ':oid': invite.ownerId,
                ':ts': new Date().toISOString(),
            },
        }).promise();

        const joinRequest = await createTenantJoinRequest({
            owner,
            tenant: tenantUser,
            property,
        });

        if (joinRequest?.created && owner?.email) {
            await sendOwnerRequestEmail({
                owner,
                tenant: {
                    userId: tenantUser.userId,
                    name: tenantUser.name,
                    email: tenantUser.email,
                    phone: tenantUser.phoneNumber || tenantUser.phone,
                },
                property,
                requestTitle: 'Tenant Join Request',
                requestType: 'tenant_join',
                message: 'Tenant used an invitation code and is waiting for room allocation and check-in.',
            }).catch((emailErr) => {
                console.warn('[linkTenantProperty] non-critical owner email failed', emailErr.message);
            });
        }

        return response.success({
            message: 'Successfully linked to property. Owner has been notified for check-in.',
            propertyId: invite.propertyId,
            propertyName: invite.propertyName,
            ownerId: invite.ownerId,
        });
    } catch (err) {
        console.error('[linkTenantProperty]', err);
        return response.error(err.message || 'Internal server error', 500);
    }
};
