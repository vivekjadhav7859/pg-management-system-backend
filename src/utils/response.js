/**
 * Success response helper
 */
exports.success = (data, statusCode = 200) => {
    return {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
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
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify(errorResponse)
    };
};