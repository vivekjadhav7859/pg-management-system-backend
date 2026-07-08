const tenantService = require('../../services/tenant.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'tenant') {
            return response.error('Only tenants can sign their agreement', 403);
        }

        const tenant = await tenantService.getTenantByUserId(dbUser.userId);
        if (!tenant) return response.error('Active tenant profile not found', 404);

        const body = JSON.parse(event.body || '{}');
        if (!body.accepted) {
            return response.error('Agreement acceptance is required', 400);
        }

        const signedAt = new Date().toISOString();
        const updated = await tenantService.updateTenant(tenant.tenantId, {
            agreementStatus: 'signed',
            agreementSignedAt: signedAt,
            agreementAcceptedBy: dbUser.userId,
        });

        return response.success({
            message: 'Agreement signed successfully',
            tenant: updated,
        });
    } catch (err) {
        console.error('[signAgreement]', err);
        return response.error('Failed to sign agreement', 500);
    }
};
