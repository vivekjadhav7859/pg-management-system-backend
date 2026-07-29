const { logoutUser } = require('../../services/cognito.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        console.log('Logout request received');

        // Extract access token from Authorization header
        const authHeader = event.headers.Authorization || event.headers.authorization;

        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');

        await logoutUser(accessToken);

        console.log('User logged out successfully');

        return response.success({
            message: 'Logged out successfully'
        });

    } catch (err) {
        console.error('Logout error:', err);
        return response.error('Logout failed', 400);
    }
};