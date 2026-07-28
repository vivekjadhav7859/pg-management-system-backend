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

        const ipAddress = event.requestContext?.identity?.sourceIp || 'UNKNOWN';
        const userAgent = event.headers?.['User-Agent'] || event.headers?.['user-agent'] || 'UNKNOWN';

        const exportData = await privacyService.generateUserDataExport(userId);

        await recordAuditLog({
            userId,
            action: 'DATA_EXPORT',
            ipAddress,
            userAgent,
            metadata: { type: 'DPDP_PORTABILITY_EXPORT' }
        });

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                data: exportData
            })
        };
    } catch (error) {
        console.error('Error in exportData handler:', error);
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
