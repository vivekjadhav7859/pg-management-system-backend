const { verifyToken } = require('../../services/cognito.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        console.log('Verify token request received');

        // Extract access token from Authorization header
        const authHeader = event.headers.Authorization || event.headers.authorization;

        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');

        const userInfo = await verifyToken(accessToken);

        console.log('Token verified successfully');

        return response.success({
            message: 'Token is valid',
            user: userInfo
        });

    } catch (err) {
        console.error('Verify token error:', err);
        return response.error('Invalid or expired token', 401);
    }
};