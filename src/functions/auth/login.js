const { loginUser } = require('../../services/cognito.service');
const response = require('../../utils/response');

module.exports.handler = async (event) => {
    try {
        const { email, password } = JSON.parse(event.body);

        if (!email || !password) {
            return response.error('Email and password are required');
        }

        const authResult = await loginUser(email, password);

        return response.success({
            accessToken: authResult.AccessToken,
            refreshToken: authResult.RefreshToken,
            idToken: authResult.IdToken,
        });
    } catch (err) {
        console.error(err);
        return response.error('Invalid credentials', 401);
    }
};
