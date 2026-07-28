const privacyService = require('../../services/privacy.service');

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

        const consent = await privacyService.getUserConsent(userId);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: true,
                data: consent
            })
        };
    } catch (error) {
        console.error('Error in getConsent handler:', error);
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
