const { signUpUser } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');
const { validateEmail, validatePassword, validateRequiredFields, sanitizeInput } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);

        const body = JSON.parse(event.body);
        const { email, password, name, phone, userType } = body;

        // Validate required fields
        const requiredValidation = validateRequiredFields(body, ['email', 'password', 'userType']);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return response.error(emailValidation.message, 400);
        }

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            return response.error(passwordValidation.message, 400);
        }

        // Sanitize inputs (trim only — no HTML encoding)
        const sanitizedEmail = email.toLowerCase().trim();
        const sanitizedName = name ? sanitizeInput(name) : null;
        const sanitizedPhone = phone ? sanitizeInput(phone) : null;
        const sanitizedUserType = userType ? sanitizeInput(userType) : null;

        // Only allow tenant and owner roles in public signup
        const validUserTypes = ['tenant', 'owner'];
        if (!validUserTypes.includes(sanitizedUserType)) {
            return response.error('Invalid user type. Must be tenant or owner', 400);
        }

        // Check if user already exists in DynamoDB
        const existingUser = await dynamoService.getUserByEmail(sanitizedEmail);
        if (existingUser) {
            return response.error('User with this email already exists', 409);
        }

        // Use client-side signUp — Cognito will send a verification email with OTP
        let cognitoUser;
        try {
            cognitoUser = await signUpUser(sanitizedEmail, password, {
                name: sanitizedName,
                phone_number: sanitizedPhone
            });
        } catch (err) {
            if (err.code === 'UsernameExistsException') {
                return response.error('User with this email already exists', 409);
            }
            if (err.code === 'InvalidPasswordException') {
                return response.error('Password does not meet complexity requirements', 400);
            }
            throw err;
        }

        // Create user in DynamoDB — emailVerified: false until OTP confirmed
        const dbUser = await dynamoService.createUser({
            cognitoUserId: cognitoUser.userId,
            email: sanitizedEmail,
            name: sanitizedName,
            phoneNumber: sanitizedPhone,
            userType: sanitizedUserType,
            emailVerified: false
        });

        return response.success({
            message: 'Account created. Please check your email for a verification code.',
            user: {
                userId: dbUser.userId,
                email: dbUser.email,
                name: dbUser.name,
                userType: dbUser.userType,
                emailVerified: false
            }
        }, 201);

    } catch (err) {
        console.error('Signup error:', err);

        if (err.message?.includes('already exists')) {
            return response.error(err.message, 409);
        }

        return response.error('Signup failed. Please try again.', 400);
    }
};
