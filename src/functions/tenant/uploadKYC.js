const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const tenantService = require('../../services/tenant.service');
const response = require('../../utils/response');

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

        // Generate presigned upload URL
        const uploadData = await tenantService.generateUploadUrl(tenantId, documentType, fileExtension);

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