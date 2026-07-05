const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.createTenantJoinRequest = async ({ owner, tenant, property }) => {
    if (!owner?.userId || !tenant?.userId || !property?.propertyId) return null;

    const existing = await dynamodb.query({
        TableName: process.env.NOTIFICATION_TABLE,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userIdIndex = :ownerId',
        FilterExpression: 'tenantUserId = :tenantUserId AND entityType = :entityType AND propertyIdIndex = :propertyId',
        ExpressionAttributeValues: {
            ':ownerId': owner.userId,
            ':tenantUserId': tenant.userId,
            ':entityType': 'tenantJoinRequest',
            ':propertyId': property.propertyId,
        },
        Limit: 50,
    }).promise();

    if (existing.Items?.length) {
        return { request: existing.Items[0], created: false };
    }

    const timestamp = new Date().toISOString();
    const requestId = uuidv4();
    const title = 'Tenant Join Request';
    const tenantLabel = tenant.name || tenant.email || 'A tenant';
    const description = `${tenantLabel} used the invite code for ${property.propertyName}. Complete room allocation and check-in from tenant management.`;

    const ownerRequest = {
        id: requestId,
        userIdIndex: owner.userId,
        propertyIdIndex: property.propertyId,
        propertyName: property.propertyName || '',
        type: title,
        title,
        description,
        entityId: requestId,
        entityType: 'tenantJoinRequest',
        read: false,
        requestStatus: 'pending',
        requestType: 'tenant_join',
        tenantUserId: tenant.userId,
        tenantName: tenant.name || '',
        tenantEmail: tenant.email || '',
        tenantPhone: tenant.phoneNumber || tenant.phone || '',
        createdAt: timestamp,
        createdAtIndex: timestamp,
    };

    const tenantCopy = {
        ...ownerRequest,
        id: uuidv4(),
        userIdIndex: tenant.userId,
        title: 'Join Request Sent',
        description: `Your account is linked to ${property.propertyName}. The owner has been notified for room allocation and check-in.`,
        read: false,
    };

    await Promise.all([
        dynamodb.put({ TableName: process.env.NOTIFICATION_TABLE, Item: ownerRequest }).promise(),
        dynamodb.put({ TableName: process.env.NOTIFICATION_TABLE, Item: tenantCopy }).promise(),
    ]);

    return { request: ownerRequest, created: true };
};
