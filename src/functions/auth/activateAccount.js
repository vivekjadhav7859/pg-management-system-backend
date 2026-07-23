const dynamoService = require('../../services/dynamodb.service');
const cognitoService = require('../../services/cognito.service');
const tenantService = require('../../services/tenant.service');
const notificationService = require('../../services/notification.service');
const { NOTIFICATION_EVENTS } = require('../../constants/notificationEvents');
const response = require('../../utils/response');
const { validatePassword, validateRequiredFields, sanitizeInput } = require('../../utils/validator');
const { hashToken } = require('../../utils/crypto');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        console.log('Activate account request received');

        const body = JSON.parse(event.body || '{}');
        const { token, id, password, name, phone, emergencyContact, termsAccepted } = body;

        const requiredValidation = validateRequiredFields(body, ['token', 'id', 'password', 'termsAccepted']);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        if (termsAccepted !== true && termsAccepted !== 'true') {
            return response.error('You must accept the terms and conditions to activate your account', 400);
        }

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            return response.error(passwordValidation.message, 400);
        }

        const user = await dynamoService.getUserById(id);
        if (!user) {
            return response.error('Invalid user or invitation link', 404);
        }

        if (user.status === 'active' && user.invitationStatus === 'activated') {
            return response.error('Account is already activated. Please log in with your password.', 400);
        }

        if (!user.invitationTokenHash) {
            return response.error('Invalid or expired invitation token', 400);
        }

        const computedHash = hashToken(token);
        if (computedHash !== user.invitationTokenHash) {
            return response.error('Invalid invitation token', 400);
        }

        if (user.invitationExpiresAt && new Date() > new Date(user.invitationExpiresAt)) {
            const { notifyOwnerLinkExpired } = require('../../utils/expiredLinkAlert');
            const tenant = await tenantService.getTenantByUserId(id).catch(() => null);
            const ownerId = tenant?.ownerId || user.linkedOwnerId;
            if (ownerId) {
                await notifyOwnerLinkExpired({
                    ownerId,
                    propertyId: tenant?.propertyId || '',
                    propertyName: '',
                    tenantName: user.name,
                    tenantEmail: user.email,
                    linkType: 'tenant_invitation',
                });
            }
            return response.error('Invitation token has expired. Please contact your property owner.', 410, { code: 'TOKEN_EXPIRED' });
        }

        const timestamp = new Date().toISOString();
        const sanitizedName = name ? sanitizeInput(name) : user.name;
        const sanitizedPhone = phone ? sanitizeInput(phone) : user.phoneNumber;

        // 1. Set permanent password in Cognito
        await cognitoService.setUserPassword(user.email, password);

        // 2. Mark email_verified in Cognito
        try {
            await cognitoService.updateUserAttributes(user.email, [
                { Name: 'email_verified', Value: 'true' },
                { Name: 'name', Value: sanitizedName || '' }
            ]);
        } catch (attrErr) {
            console.warn('Non-critical: failed to update Cognito attributes', attrErr.message);
        }

        // 3. Initiate authentication to get session tokens
        let authResult;
        try {
            authResult = await cognitoService.loginUser(user.email, password);
        } catch (loginErr) {
            console.error('Cognito login after password set failed:', loginErr);
            throw new Error('Account password updated, but initial login failed. Please attempt manual login.');
        }

        // 4. Update User record in DynamoDB
        await dynamoService.updateUser(user.userId, {
            name: sanitizedName,
            phoneNumber: sanitizedPhone,
            status: 'active',
            profileCompleted: true,
            lastLoginAt: timestamp
        });

        // Set activation flags on User record
        const AWS = require('aws-sdk');
        const dynamodb = new AWS.DynamoDB.DocumentClient();
        await dynamodb.update({
            TableName: process.env.USER_TABLE,
            Key: { userId: user.userId },
            UpdateExpression: 'SET emailVerified = :ev, invitationStatus = :st, invitationTokenHash = :nullVal, activatedAt = :ts, onboardingCompletedAt = :ts, updatedAt = :ts',
            ExpressionAttributeValues: {
                ':ev': true,
                ':st': 'activated',
                ':nullVal': null,
                ':ts': timestamp
            }
        }).promise();

        // 5. Update Tenant record in DynamoDB
        const tenant = await tenantService.getTenantByUserId(user.userId);
        if (tenant) {
            await tenantService.updateTenant(tenant.tenantId, {
                status: 'active',
                tenancyStatus: 'ongoing',
                name: sanitizedName,
                phone: sanitizedPhone,
                emergencyContact: emergencyContact || tenant.emergencyContact
            });

            await dynamodb.update({
                TableName: process.env.TENANT_TABLE,
                Key: { tenantId: tenant.tenantId },
                UpdateExpression: 'SET onboardingStatus = :obs, termsAccepted = :ta, termsAcceptedAt = :ts, updatedAt = :ts',
                ExpressionAttributeValues: {
                    ':obs': 'profile_completed',
                    ':ta': true,
                    ':ts': timestamp
                }
            }).promise();
        }

        // Send Email Verified / Account Activated notice
        try {
            await notificationService.sendNotification({
                type: NOTIFICATION_EVENTS.EMAIL_VERIFIED,
                ownerId: 'system',
                tenantId: tenant ? tenant.tenantId : '',
                tenantEmail: user.email,
                data: { name: sanitizedName }
            });
        } catch (_) {}

        return response.success({
            message: 'Account activated successfully!',
            tokens: {
                accessToken: authResult.AccessToken,
                refreshToken: authResult.RefreshToken,
                idToken: authResult.IdToken,
                expiresIn: authResult.ExpiresIn,
                tokenType: authResult.TokenType
            },
            user: {
                userId: user.userId,
                email: user.email,
                name: sanitizedName,
                phoneNumber: sanitizedPhone,
                userType: 'tenant',
                status: 'active',
                emailVerified: true,
                profileCompleted: true
            }
        });

    } catch (err) {
        console.error('Activate account error:', err);
        return response.error(err.message || 'Failed to activate account', 500);
    }
};
