const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const response = require('../../utils/response');

const s3 = new AWS.S3();
const S3_BUCKET = process.env.S3_BUCKET;

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILES = 8;
const UPLOAD_TTL_SECONDS = 5 * 60;

const sanitizeFileName = (fileName = 'image') => {
    return String(fileName)
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80);
};

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can upload property images', 403);
        }

        const body = JSON.parse(event.body || '{}');
        const files = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES) : [];
        if (!files.length) return response.error('At least one image file is required', 400);

        const uploads = await Promise.all(files.map(async (file) => {
            const contentType = file.contentType || file.type || '';
            if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
                throw new Error(`Unsupported image type: ${contentType || 'unknown'}`);
            }

            const safeName = sanitizeFileName(file.fileName || file.name);
            const key = `property-images/${dbUser.userId}/${uuidv4()}-${safeName}`;
            const uploadUrl = await s3.getSignedUrlPromise('putObject', {
                Bucket: S3_BUCKET,
                Key: key,
                ContentType: contentType,
                Expires: UPLOAD_TTL_SECONDS,
            });

            return {
                key,
                uploadUrl,
                contentType,
            };
        }));

        return response.success({ uploads });
    } catch (err) {
        console.error('[createImageUploadUrls]', err);
        if (err.message && err.message.includes('Unsupported image type')) {
            return response.error(err.message, 400);
        }
        return response.error('Failed to create image upload URLs', 500);
    }
};
