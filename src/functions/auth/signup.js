const { createUser } = require('../../services/cognito.service');
const response = require('../../utils/response');
const { validateEmail, validatePassword, validateRequiredFields, sanitizeInput } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        console.log('Signup request received:', { body: event.body });

        // Parse request body
        const body = JSON.parse(event.body);
        const { email, password, name, phone, userType } = body;

        // Validate required fields
        const requiredValidation = validateRequiredFields(body, ['email', 'password']);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        // Validate email
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return response.error(emailValidation.message, 400);
        }

        // Validate password
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            return response.error(passwordValidation.message, 400);
        }

        // Sanitize inputs
        const sanitizedEmail = sanitizeInput(email.toLowerCase());
        const sanitizedName = name ? sanitizeInput(name) : null;
        const sanitizedPhone = phone ? sanitizeInput(phone) : null;
        const sanitizedUserType = userType ? sanitizeInput(userType) : 'tenant';

        // Validate user type
        const validUserTypes = ['tenant', 'owner', 'admin'];
        if (!validUserTypes.includes(sanitizedUserType)) {
            return response.error('Invalid user type. Must be tenant, owner, or admin', 400);
        }

        // Create user in Cognito
        const result = await createUser(sanitizedEmail, password);

        console.log('User created successfully:', result);

        return response.success({
            message: 'User registered successfully',
            email: result.email,
            userType: sanitizedUserType
        }, 201);

    } catch (err) {
        console.error('Signup error:', err);

        // Handle specific error messages
        const errorMessage = err.message || 'Signup failed';
        const statusCode = err.message?.includes('already exists') ? 409 : 400;

        return response.error(errorMessage, statusCode);
    }
};