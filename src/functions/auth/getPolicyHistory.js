const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);

        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');
        const cognitoUser = await verifyToken(accessToken);
        const dbUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!dbUser) {
            return response.error('User not found', 404);
        }

        const history = await dynamoService.getPolicyLogsByUserId(dbUser.userId);

        return response.success({
            message: 'Policy acceptance history retrieved successfully',
            userId: dbUser.userId,
            currentConsent: dbUser.policyConsent || null,
            history
        });
    } catch (err) {
        console.error('Error fetching policy history:', err);
        if (err.message && err.message.includes('expired')) {
            return response.error('Token expired', 401);
        }
        return response.error('Failed to retrieve policy history', 500);
    }
};
