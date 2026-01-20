const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const response = require('../../utils/response');
const { sanitizeInput } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');
        const cognitoUser = await verifyToken(accessToken);
        const dbUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!dbUser || dbUser.status !== 'active') {
            return response.error('User not found or not active', 403);
        }

        const tenantId = event.pathParameters.tenantId;
        const tenant = await tenantService.getTenantById(tenantId);

        if (!tenant) {
            return response.error('Tenant not found', 404);
        }

        // Verify property ownership
        const property = await propertyService.getPropertyById(tenant.propertyId);
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only update tenants of your properties', 403);
        }

        const body = JSON.parse(event.body);
        const updates = {};

        if (body.name !== undefined) {
            updates.name = sanitizeInput(body.name);
        }

        if (body.phone !== undefined) {
            updates.phone = sanitizeInput(body.phone);
        }

        if (body.emergencyContact !== undefined) {
            updates.emergencyContact = body.emergencyContact;
        }

        if (body.rentAmount !== undefined) {
            updates.rentAmount = body.rentAmount;
        }

        if (body.kycStatus !== undefined) {
            const validStatuses = ['pending', 'verified', 'rejected'];
            if (!validStatuses.includes(body.kycStatus)) {
                return response.error('Invalid KYC status', 400);
            }
            updates.kycStatus = body.kycStatus;
        }

        if (Object.keys(updates).length === 0) {
            return response.error('No valid fields to update', 400);
        }

        const updatedTenant = await tenantService.updateTenant(tenantId, updates);

        return response.success({
            message: 'Tenant updated successfully',
            tenant: updatedTenant
        });

    } catch (err) {
        console.error('Update tenant error:', err);
        return response.error('Failed to update tenant', 500);
    }
};