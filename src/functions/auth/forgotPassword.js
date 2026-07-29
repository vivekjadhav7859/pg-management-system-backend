const { forgotPassword } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');
const { validateEmail, validateRequiredFields } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);

        const body = JSON.parse(event.body);
        const { email } = body;

        const requiredValidation = validateRequiredFields(body, ['email']);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return response.error(emailValidation.message, 400);
        }

        const sanitizedEmail = email.toLowerCase().trim();

        // Verify user exists in our system before calling Cognito
        // This prevents leaking whether an email is registered
        const dbUser = await dynamoService.getUserByEmail(sanitizedEmail);

        if (!dbUser || dbUser.status === 'deleted') {
            // Return success regardless to prevent user enumeration
            return response.success({ message: 'If this email is registered, a reset code has been sent.' });
        }

        await forgotPassword(sanitizedEmail);

        return response.success({
            message: 'If this email is registered, a reset code has been sent.'
        });

    } catch (err) {
        console.error('Forgot password error:', err);

        // Return generic message to prevent information leakage
        if (err.code === 'LimitExceededException') {
            return response.error('Too many requests. Please try again later.', 429);
        }

        return response.success({ message: 'If this email is registered, a reset code has been sent.' });
    }
};
