const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const response = require('../../utils/response');
const { hashToken } = require('../../utils/crypto');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        console.log('Verify invitation token request received');

        const queryParams = event.queryStringParameters || {};
        const { token, id } = queryParams;

        if (!token || !id) {
            return response.error('Missing required invitation parameters (token, id)', 400);
        }

        const user = await dynamoService.getUserById(id);
        if (!user) {
            return response.error('Invalid or expired invitation link', 404);
        }

        if (user.status === 'active' && user.emailVerified && user.invitationStatus === 'activated') {
            return response.success({
                status: 'already_activated',
                message: 'Your account is already activated. Please log in with your password.',
                user: {
                    email: user.email,
                    name: user.name
                }
            });
        }

        if (!user.invitationTokenHash) {
            return response.error('Invalid or expired invitation link', 400);
        }

        // Verify SHA-256 token hash match
        const computedHash = hashToken(token);
        if (computedHash !== user.invitationTokenHash) {
            return response.error('Invalid invitation token', 400);
        }

        // Fetch tenant details for context
        const tenant = await tenantService.getTenantByUserId(id);
        let property = null;
        if (tenant?.propertyId) {
            property = await propertyService.getPropertyById(tenant.propertyId);
        }

        // Check expiration
        if (user.invitationExpiresAt && new Date() > new Date(user.invitationExpiresAt)) {
            const { notifyOwnerLinkExpired } = require('../../utils/expiredLinkAlert');
            const ownerId = property?.ownerId || user.linkedOwnerId;
            if (ownerId) {
                await notifyOwnerLinkExpired({
                    ownerId,
                    propertyId: tenant?.propertyId || '',
                    propertyName: property?.propertyName || '',
                    tenantName: user.name,
                    tenantEmail: user.email,
                    linkType: 'tenant_invitation',
                });
            }
            return response.error('Invitation token has expired. Please ask your property owner for a new invitation.', 410, { code: 'TOKEN_EXPIRED' });
        }

        return response.success({
            status: 'valid',
            invitation: {
                userId: user.userId,
                email: user.email,
                name: user.name,
                phoneNumber: user.phoneNumber,
                propertyName: property ? property.propertyName : 'Property',
                roomNumber: tenant ? tenant.roomNumber : null,
                bedNumber: tenant ? tenant.bedNumber : null,
                rentAmount: tenant ? tenant.rentAmount : null,
                expiresAt: user.invitationExpiresAt
            }
        });

    } catch (err) {
        console.error('Verify invitation token error:', err);
        return response.error('Failed to verify invitation token', 500);
    }
};
