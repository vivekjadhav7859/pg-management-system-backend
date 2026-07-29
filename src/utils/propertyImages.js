const AWS = require('aws-sdk');

const s3 = new AWS.S3();
const S3_BUCKET = process.env.S3_BUCKET;
const SIGNED_IMAGE_TTL_SECONDS = 60 * 60;

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ''));

const extractKeyFromUrl = (value) => {
    try {
        const parsed = new URL(value);
        return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    } catch {
        return value;
    }
};

const normalizeImageKey = (image) => {
    if (!image) return '';
    if (typeof image === 'object') {
        return image.key || image.imageKey || image.s3Key || image.url || '';
    }
    const raw = String(image);
    if (!raw) return '';
    if (isHttpUrl(raw)) return extractKeyFromUrl(raw);
    return raw;
};

const getSignedImageUrl = (key) => {
    if (!key || !S3_BUCKET) return '';
    return s3.getSignedUrl('getObject', {
        Bucket: S3_BUCKET,
        Key: key,
        Expires: SIGNED_IMAGE_TTL_SECONDS,
    });
};

exports.normalizeImageKeys = (images = []) => {
    return (Array.isArray(images) ? images : [])
        .map(normalizeImageKey)
        .filter(Boolean);
};

exports.withSignedImageUrls = (item) => {
    if (!item) return item;
    const imageKeys = exports.normalizeImageKeys(item.images);
    return {
        ...item,
        imageKeys,
        images: imageKeys.map((key) => getSignedImageUrl(key)).filter(Boolean),
    };
};

exports.withSignedImageUrlsList = (items = []) => {
    return items.map((item) => exports.withSignedImageUrls(item));
};
