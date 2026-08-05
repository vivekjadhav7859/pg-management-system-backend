const tenantService = require('../../services/tenant.service');
const response = require('../../utils/response');
const { sanitizeInput } = require('../../utils/validator');

const calculateCompletionPercentage = (tenant) => {
    let score = 0;
    // 1. Account Info (20%)
    if (tenant.name && (tenant.email || tenant.phone)) score += 20;

    // 2. Agreement Signed (20%)
    if (tenant.agreementStatus === 'signed') score += 20;

    // 3. Basic Profile Details (20%)
    if (tenant.gender || tenant.dob || tenant.occupation || tenant.address) score += 20;

    // 4. Emergency Contact (20%)
    if (tenant.emergencyContact?.name && (tenant.emergencyContact?.phone || tenant.emergencyContact?.phoneNumber)) score += 20;

    // 5. KYC Status / Upload (20%)
    if (['submitted', 'verified'].includes(tenant.kycStatus) || (tenant.kycDocs && Object.keys(tenant.kycDocs).length > 0)) score += 20;

    return Math.min(score, 100);
};

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'tenant') {
            return response.error('Only tenants can update their profile', 403);
        }

        const tenant = await tenantService.getTenantByUserId(dbUser.userId);
        if (!tenant) return response.error('Tenant profile not found', 404);

        const body = JSON.parse(event.body || '{}');
        const updates = {};

        if (body.gender !== undefined) updates.gender = sanitizeInput(body.gender);
        if (body.dob !== undefined) updates.dob = sanitizeInput(body.dob);
        if (body.occupation !== undefined) updates.occupation = sanitizeInput(body.occupation);
        if (body.address !== undefined) updates.address = sanitizeInput(body.address);
        if (body.medicalNotes !== undefined) updates.medicalNotes = sanitizeInput(body.medicalNotes);
        if (body.vehicleDetails !== undefined) updates.vehicleDetails = sanitizeInput(body.vehicleDetails);
        if (body.profilePhoto !== undefined) updates.profilePhoto = body.profilePhoto;

        if (body.emergencyContact !== undefined) {
            updates.emergencyContact = {
                name: body.emergencyContact.name ? sanitizeInput(body.emergencyContact.name) : '',
                relationship: body.emergencyContact.relationship ? sanitizeInput(body.emergencyContact.relationship) : '',
                phone: body.emergencyContact.phone ? sanitizeInput(body.emergencyContact.phone) : '',
            };
        }

        const merged = { ...tenant, ...updates };
        const profileCompletionPct = calculateCompletionPercentage(merged);
        updates.profileCompletionPct = profileCompletionPct;

        const updatedTenant = await tenantService.updateTenant(tenant.tenantId, updates);

        return response.success({
            message: 'Profile updated successfully',
            tenant: updatedTenant,
            profileCompletionPct,
        });
    } catch (err) {
        console.error('[updateTenantProfile]', err);
        return response.error('Failed to update tenant profile', 500);
    }
};
