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

        const updatedConsent = await privacyService.updateUserConsent(userId, body, ipAddress);

        await recordAuditLog({
            userId,
            action: 'CONSENT_UPDATE',
            ipAddress,
            userAgent,
            metadata: { updatedConsent }
        });

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: true,
                message: 'Consent preferences updated successfully',
                data: updatedConsent
            })
        };
    } catch (error) {
        console.error('Error in updateConsent handler:', error);
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
