
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
        let viewUrl = null;
        try {
            if (process.env.S3_BUCKET) {
                viewUrl = await s3.getSignedUrlPromise('getObject', {
                    Bucket: process.env.S3_BUCKET,
                    Key: doc.key,
                    Expires: 900,
                });
            }
        } catch (err) {
            console.warn(`[getTenants] S3 signed URL error for key ${doc.key}:`, err.message);
        }
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

        if (dbUser.status !== 'active') {
            return response.error('Account is not active', 403);
        }

        const propertyId = event.pathParameters?.propertyId;
        if (!propertyId) {
            return response.error('Property ID is required', 400);
        }

        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        const isAdmin = dbUser.userType === 'admin';
        const isOwner = dbUser.userType === 'owner' && property.ownerId === dbUser.userId;

        if (!isAdmin && !isOwner) {
            return response.error('You can only view tenants of your own properties', 403);
        }

        const result = await tenantService.getTenantsByProperty(propertyId);
        const roomsResult = await propertyService.getRoomsByProperty(propertyId).catch(() => ({ rooms: [] }));
        const roomMap = new Map((roomsResult.rooms || []).map(r => [r.roomId, r.roomNumber]));

        const rawTenants = await Promise.all((result.tenants || []).map(withKycViewUrls));
        const tenants = rawTenants.map(t => {
            const resolvedRoomNumber = t.roomNumber || roomMap.get(t.roomId) || null;
            return {
                ...t,
                roomNumber: resolvedRoomNumber,
                roomName: resolvedRoomNumber ? `Room ${resolvedRoomNumber}` : null
            };
        });

        return response.success({
            message: 'Tenants retrieved successfully',
            tenants,
            count: tenants.length,
            propertyId: propertyId
        });

    } catch (err) {
        console.error('Get tenants error:', err);
        return response.error('Failed to retrieve tenants', 500);
    }
};
