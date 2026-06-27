
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        const tenantId = event.pathParameters.tenantId;
        const body = JSON.parse(event.body);
        const { documentType, fileExtension } = body;

        if (!documentType || !fileExtension) {
            return response.error('Document type and file extension are required', 400);
        }

        const validDocTypes = ['aadhar', 'pan', 'photo', 'agreement'];
        if (!validDocTypes.includes(documentType)) {
            return response.error('Invalid document type', 400);
        }

        const tenant = await tenantService.getTenantById(tenantId);
        if (!tenant) {
            return response.error('Tenant not found', 404);
        }

        if (dbUser.userType === 'tenant' && tenant.userId !== dbUser.userId) {
            return response.error('You can only upload KYC for your own tenant profile', 403);
        }

        if (dbUser.userType === 'owner') {
            const property = await propertyService.getPropertyById(tenant.propertyId);
            if (!property || property.ownerId !== dbUser.userId) {
                return response.error('You can only upload KYC for tenants in your properties', 403);
            }
        }

        // Generate presigned upload URL
        const uploadData = await tenantService.generateUploadUrl(tenantId, documentType, fileExtension);

        await tenantService.updateTenant(tenantId, {
            kycStatus: 'pending',
            kycDocuments: {
                ...(tenant.kycDocuments || {}),
                [documentType]: {
                    key: uploadData.key,
                    documentUrl: uploadData.documentUrl,
                    uploadedAt: new Date().toISOString(),
                    status: 'pending',
                },
            },
        });
        
        return response.success({
            message: 'Upload URL generated successfully',
            uploadUrl: uploadData.uploadUrl,
            documentUrl: uploadData.documentUrl,
            key: uploadData.key,
            expiresIn: 300 // 5 minutes
        });

    } catch (err) {
        console.error('Generate upload URL error:', err);
        return response.error('Failed to generate upload URL', 500);
    }
};
