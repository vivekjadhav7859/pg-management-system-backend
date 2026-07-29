const { resendConfirmationCode } = require('../../services/cognito.service');
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

        // Check user exists and is not yet verified
        const dbUser = await dynamoService.getUserByEmail(sanitizedEmail);
        if (!dbUser) {
            // Return success to prevent enumeration
            return response.success({ message: 'If this email is pending verification, a new code has been sent.' });
        }

        if (dbUser.emailVerified === true) {
            return response.error('This email is already verified. Please log in.', 400, { code: 'ALREADY_VERIFIED' });
        }

        await resendConfirmationCode(sanitizedEmail);

        return response.success({ message: 'A new verification code has been sent to your email.' });

    } catch (err) {
        console.error('Resend verification error:', err);

        if (err.code === 'LimitExceededException') {
            return response.error('Too many requests. Please wait before requesting another code.', 429);
        }
        if (err.code === 'InvalidParameterException') {
            // Cognito throws this if user is already confirmed
            return response.error('This email is already verified. Please log in.', 400, { code: 'ALREADY_VERIFIED' });
        }

        return response.success({ message: 'If this email is pending verification, a new code has been sent.' });
    }
};
