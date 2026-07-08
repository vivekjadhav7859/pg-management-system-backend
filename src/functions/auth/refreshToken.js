const { refreshToken } = require('../../services/cognito.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        console.log('Refresh token request received');

        const body = JSON.parse(event.body);
        const { refreshToken: token } = body;

        if (!token) {
            return response.error('Refresh token is required', 400);
        }

        const authResult = await refreshToken(token);

        console.log('Token refreshed successfully');

        return response.success({
            message: 'Token refreshed successfully',
            accessToken: authResult.AccessToken,
            idToken: authResult.IdToken,
            expiresIn: authResult.ExpiresIn,
            tokenType: authResult.TokenType
        });

    } catch (err) {
        console.error('Refresh token error:', err);
        return response.error('Invalid or expired refresh token', 401);
    }
};