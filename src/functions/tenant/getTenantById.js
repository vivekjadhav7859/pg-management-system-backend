
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const response = require('../../utils/response');
const AWS = require('aws-sdk');

const s3 = new AWS.S3();

async function withKycViewUrls(tenant) {
    const documents = tenant.kycDocuments || {};
    const entries = await Promise.all(Object.entries(documents).map(async ([type, doc]) => {
        if (!doc?.key) return [type, doc];
        const viewUrl = await s3.getSignedUrlPromise('getObject', {
            Bucket: process.env.S3_BUCKET,
            Key: doc.key,
            Expires: 900,
        });
        return [type, { ...doc, viewUrl }];
    }));
    return { ...tenant, kycDocuments: Object.fromEntries(entries) };
}

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        const tenantId = event.pathParameters.tenantId;
        const tenant = await tenantService.getTenantById(tenantId);

        if (!tenant) {
            return response.error('Tenant not found', 404);
        }

        // Verify property ownership
        const property = await propertyService.getPropertyById(tenant.propertyId);
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin' && dbUser.userId !== tenant.userId) {
            return response.error('You can only view tenants of your properties', 403);
        }

        const tenantWithDocuments = await withKycViewUrls(tenant);

        return response.success({
            message: 'Tenant retrieved successfully',
            tenant: tenantWithDocuments
        });

    } catch (err) {
        console.error('Get tenant error:', err);
        return response.error('Failed to retrieve tenant', 500);
    }
};
