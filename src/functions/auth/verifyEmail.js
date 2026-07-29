const { confirmUserEmail } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');
const { validateEmail, validateRequiredFields } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);

        const body = JSON.parse(event.body);
        const { email, code } = body;

        const requiredValidation = validateRequiredFields(body, ['email', 'code']);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return response.error(emailValidation.message, 400);
        }

        if (typeof code !== 'string' || code.trim().length === 0) {
            return response.error('Verification code is required', 400);
        }

        const sanitizedEmail = email.toLowerCase().trim();
        const sanitizedCode = code.trim();

        // Confirm the Cognito user
        await confirmUserEmail(sanitizedEmail, sanitizedCode);

        // Update DynamoDB record to reflect verified status
        const dbUser = await dynamoService.getUserByEmail(sanitizedEmail);
        if (dbUser) {
            await dynamoService.updateEmailVerified(dbUser.userId);
        }

        return response.success({ message: 'Email verified successfully. You can now log in.' });

    } catch (err) {
        console.error('Verify email error:', err);

        if (err.code === 'CodeMismatchException') {
            return response.error('Invalid verification code. Please check and try again.', 400, { code: 'CODE_MISMATCH' });
        }
        if (err.code === 'ExpiredCodeException') {
            return response.error('Verification code has expired. Please request a new one.', 400, { code: 'CODE_EXPIRED' });
        }
        if (err.code === 'NotAuthorizedException') {
            return response.error('This account is already verified. Please log in.', 400, { code: 'ALREADY_VERIFIED' });
        }
        if (err.code === 'LimitExceededException') {
            return response.error('Too many attempts. Please try again later.', 429);
        }

        return response.error('Verification failed. Please try again.', 400);
    }
};
