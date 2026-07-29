const AWS = require('aws-sdk');
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const notificationService = require('../../services/notification.service');
const { NOTIFICATION_EVENTS } = require('../../constants/notificationEvents');
const response = require('../../utils/response');
const { validateRequiredFields } = require('../../utils/validator');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');
const { generateInvitationToken, hashToken } = require('../../utils/crypto');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        console.log('Resend invitation request received');

        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can resend invitations', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        const body = JSON.parse(event.body || '{}');
        const { tenantId } = body;

        const requiredValidation = validateRequiredFields(body, ['tenantId']);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        const tenant = await tenantService.getTenantById(tenantId);
        if (!tenant) {
            return response.error('Tenant profile not found', 404);
        }

        const property = await propertyService.getPropertyById(tenant.propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only manage invitations for your own properties', 403);
        }

        const user = await dynamoService.getUserById(tenant.userId);
        if (!user) {
            return response.error('User account for tenant not found', 404);
        }

        if (user.status === 'active' && user.invitationStatus === 'activated') {
            return response.error('Tenant account is already active and verified', 400);
        }

        const timestamp = new Date().toISOString();
        const rawToken = generateInvitationToken();
        const tokenHash = hashToken(rawToken);
        const tokenExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        // Invalidate old token and write new token hash
        await dynamodb.update({
            TableName: process.env.USER_TABLE,
            Key: { userId: user.userId },
            UpdateExpression: 'SET invitationTokenHash = :th, invitationExpiresAt = :te, invitationStatus = :st, invitationSentAt = :ts, invitationResentCount = if_not_exists(invitationResentCount, :zero) + :one, updatedAt = :ts',
            ExpressionAttributeValues: {
                ':th': tokenHash,
                ':te': tokenExpiry,
                ':st': 'sent',
                ':ts': timestamp,
                ':zero': 0,
                ':one': 1
            }
        }).promise();

        const frontendUrl = process.env.FRONTEND_URL || 'https://gobanqo.com';
        const activationUrl = `${frontendUrl}/activate?token=${rawToken}&id=${user.userId}`;
        const ownerName = dbUser.name || property.propertyName || 'Property Owner';

        await notificationService.sendNotification({
            type: NOTIFICATION_EVENTS.TENANT_INVITATION,
            ownerId: dbUser.userId,
            tenantId: tenant.tenantId,
            tenantEmail: user.email,
            propertyId: property.propertyId,
            data: {
                tenantName: tenant.name || user.name,
                ownerName,
                propertyName: property.propertyName,
                roomNumber: tenant.roomNumber,
                bedNumber: tenant.bedNumber,
                rentAmount: tenant.rentAmount,
                activationUrl,
                onboardingUrl: activationUrl,
                loginUrl: `${frontendUrl}/login`,
                frontendUrl,
                expiresHours: 2160
            },
            idempotencyKey: `RESEND#${tenant.tenantId}#${timestamp}`
        });

        return response.success({
            message: 'Invitation resent successfully!',
            invitation: {
                tenantId: tenant.tenantId,
                userId: user.userId,
                email: user.email,
                expiresAt: tokenExpiry,
                resentAt: timestamp
            }
        });

    } catch (err) {
        console.error('Resend invitation error:', err);
        return response.error(err.message || 'Failed to resend invitation', 500);
    }
};
