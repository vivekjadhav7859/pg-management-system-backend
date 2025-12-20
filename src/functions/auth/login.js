const { loginUser } = require('../../services/cognito.service');
const response = require('../../utils/response');
const { validateEmail, validateRequiredFields, sanitizeInput } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        console.log('Login request received');

        // Parse request body
        const body = JSON.parse(event.body);
        const { email, password } = body;

        // Validate required fields
        const requiredValidation = validateRequiredFields(body, ['email', 'password']);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        // Validate email format
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return response.error(emailValidation.message, 400);
        }

        // Sanitize email
        const sanitizedEmail = sanitizeInput(email.toLowerCase());

        // Authenticate user with Cognito
        const authResult = await loginUser(sanitizedEmail, password);

        console.log('Login successful for user:', sanitizedEmail);

        // Return tokens
        return response.success({
            message: 'Login successful',
            accessToken: authResult.AccessToken,
            refreshToken: authResult.RefreshToken,
            idToken: authResult.IdToken,
            expiresIn: authResult.ExpiresIn,
            tokenType: authResult.TokenType
        });

    } catch (err) {
        console.error('Login error:', err);

        // Return generic error for security (don't reveal if user exists)
        return response.error('Invalid credentials', 401);
    }
};