const privacyService = require('../../services/privacy.service');
const { recordAuditLog } = require('../../services/auditLog.service');

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

        const body = JSON.parse(event.body || '{}');
        const ipAddress = event.requestContext?.identity?.sourceIp || 'UNKNOWN';
        const userAgent = event.headers?.['User-Agent'] || event.headers?.['user-agent'] || 'UNKNOWN';

        const erasureRequest = await privacyService.createDataErasureRequest(userId, body.reason);

        await recordAuditLog({
            userId,
            action: 'DELETE_REQUEST',
            ipAddress,
            userAgent,
            status: erasureRequest.status,
            metadata: { requestId: erasureRequest.requestId, reason: body.reason }
        });

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: erasureRequest.status !== 'REJECTED',
                message: erasureRequest.status === 'REJECTED' 
                    ? erasureRequest.rejectionReason 
                    : 'Account erasure request submitted successfully. Processing will complete within 30 days unless active contracts apply.',
                data: erasureRequest
            })
        };
    } catch (error) {
        console.error('Error in requestErasure handler:', error);
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
