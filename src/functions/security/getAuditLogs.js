const { getUserAuditLogs } = require('../../services/auditLog.service');

exports.handler = async (event) => {
    try {
        const userId = event.requestContext?.authorizer?.userId;
        if (!userId) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true
                },
                body: JSON.stringify({ message: 'Unauthorized' })
            };
        }

        const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit, 10) : 50;
        const logs = await getUserAuditLogs(userId, limit);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: true,
                data: logs
            })
        };
    } catch (error) {
        console.error('Error in getAuditLogs handler:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({ message: error.message || 'Internal server error' })
        };
    }
};
