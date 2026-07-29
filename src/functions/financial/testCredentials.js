const AWS = require('aws-sdk');
const propertyService = require('../../services/property.service');
const notificationService = require('../../services/notification.service');
const response = require('../../utils/response');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const USER_TABLE = process.env.USER_TABLE;

/**
 * POST /properties/{propertyId}/reminder-settings/test
 * 
 * Sends a test notification to the owner to verify system notification health.
 */
exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        if (dbUser.status !== 'active') {
            return response.error('Account is not active', 403);
        }

        const propertyId = event.pathParameters?.propertyId;
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only test settings for your properties', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        let ownerEmail = dbUser.email;
        let ownerName = dbUser.name;
        if (!ownerEmail || ownerEmail === 'undefined') {
            try {
                const ownerRes = await dynamodb.get({ TableName: USER_TABLE, Key: { userId: dbUser.userId } }).promise();
                if (ownerRes.Item) {
                    ownerEmail = ownerRes.Item.email;
                    ownerName = ownerRes.Item.name || ownerName;
                }
            } catch (userErr) {
                console.error('Owner user lookup error:', userErr);
            }
        }

        if (!ownerEmail) {
            return response.error('Owner email address not found in profile', 400);
        }

        // Send a test broadcast notice to owner
        const result = await notificationService.sendNotification({
            type: 'BROADCAST',
            ownerId: dbUser.userId,
            tenantId: 'test-recipient',
            tenantEmail: ownerEmail,
            recipientEmail: ownerEmail,
            propertyId: property.propertyId,
            data: {
                ownerName: ownerName || 'Property Manager',
                propertyName: property.propertyName,
                customSubject: '✅ GoBanqo Notification System Test',
                message: 'This is a test notification confirming that GoBanqo transactional email delivery via AWS SES is active and functioning properly for your property.'
            }
        });

        return response.success({
            message: result.sent ? 'Test notification delivered successfully' : 'Test notification processed',
            sentTo: ownerEmail,
            provider: 'AWS_SES',
            status: result.sent ? 'SENT' : 'FAILED',
            reason: result.reason || null
        });

    } catch (err) {
        console.error('Test credentials error:', err);
        return response.error('Failed to dispatch test notification', 500);
    }
};
