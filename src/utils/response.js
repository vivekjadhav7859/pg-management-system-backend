const DEFAULT_ALLOWED_ORIGINS = 'https://gobanqo.com,https://www.gobanqo.com,https://dm2ue9mo1yuef.cloudfront.net,http://localhost:5173,http://localhost:5174,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000';
const allowedOrigins = (process.env.ALLOWED_CORS_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

let requestOrigin = null;

const getHeader = (headers = {}, name) => {
    const match = Object.keys(headers).find(key => key.toLowerCase() === name.toLowerCase());
    return match ? headers[match] : null;
};

exports.setCorsOrigin = (event = {}) => {
    const origin = getHeader(event.headers, 'origin');
    requestOrigin = allowedOrigins.includes(origin) ? origin : null;
};

const getCorsHeaders = () => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': requestOrigin || allowedOrigins[0],
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block'
});

/**
 * Success response helper
 */
exports.success = (data, statusCode = 200) => {
    return {
        statusCode: statusCode,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            data: data,
            timestamp: new Date().toISOString()
        })
    };
};

/**
 * Error response helper
 */
exports.error = (message, statusCode = 500, errorDetails = null) => {
    const errorResponse = {
        success: false,
        error: {
            message: message,
            statusCode: statusCode
        },
        timestamp: new Date().toISOString()
    };

    if (errorDetails) {
        errorResponse.error.details = errorDetails;
    }

    return {
        statusCode: statusCode,
        headers: getCorsHeaders(),
        body: JSON.stringify(errorResponse)
    };
};
