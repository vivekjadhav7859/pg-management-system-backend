const { confirmForgotPassword } = require('../../services/cognito.service');
const response = require('../../utils/response');
const { validateEmail, validatePassword, validateRequiredFields } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);

        const body = JSON.parse(event.body);
        const { email, code, newPassword } = body;

        const requiredValidation = validateRequiredFields(body, ['email', 'code', 'newPassword']);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return response.error(emailValidation.message, 400);
        }

        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.valid) {
            return response.error(passwordValidation.message, 400);
        }

        if (typeof code !== 'string' || code.trim().length === 0) {
            return response.error('Verification code is required', 400);
        }

        const sanitizedEmail = email.toLowerCase().trim();
        const sanitizedCode = code.trim();

        await confirmForgotPassword(sanitizedEmail, sanitizedCode, newPassword);

        return response.success({ message: 'Password reset successfully. You can now log in.' });

    } catch (err) {
        console.error('Confirm forgot password error:', err);

        if (err.code === 'CodeMismatchException') {
            return response.error('Invalid verification code. Please check and try again.', 400, { code: 'CODE_MISMATCH' });
        }
        if (err.code === 'ExpiredCodeException') {
            return response.error('Verification code has expired. Please request a new one.', 400, { code: 'CODE_EXPIRED' });
        }
        if (err.code === 'LimitExceededException') {
            return response.error('Too many attempts. Please try again later.', 429);
        }
        if (err.code === 'InvalidPasswordException') {
            return response.error('Password does not meet complexity requirements.', 400);
        }

        return response.error('Failed to reset password. Please try again.', 400);
    }
};
