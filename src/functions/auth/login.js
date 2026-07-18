const { loginUser } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');
const { validateEmail, validateRequiredFields, sanitizeInput } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
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
        const sanitizedEmail = email.toLowerCase().trim();

        // Authenticate user with Cognito
        let authResult;
        try {
            authResult = await loginUser(sanitizedEmail, password);
        } catch (cognitoErr) {
            // Distinguish unverified users so frontend can redirect to /verify-email
            if (cognitoErr.code === 'UserNotConfirmedException') {
                return response.error('Email not verified. Please check your inbox for a verification code.', 403, { code: 'USER_NOT_VERIFIED', email: sanitizedEmail });
            }
            throw cognitoErr;
        }

        console.log('Login successful');

        // Get user details from DynamoDB
        const dbUser = await dynamoService.getUserByEmail(sanitizedEmail);

        if (!dbUser) {
            console.warn('User authenticated but not found in database:', sanitizedEmail);
            return response.error('User data not found', 404);
        }

        // Block login if email not verified (new users via signUp flow)
        // emailVerified === false means explicitly set; undefined = legacy admin-created user (allow)
        if (dbUser.emailVerified === false) {
            return response.error('Email not verified. Please check your inbox for a verification code.', 403, { code: 'USER_NOT_VERIFIED', email: sanitizedEmail });
        }

        // Check if user account is active
        if (dbUser.status === 'deleted' || dbUser.status === 'suspended') {
            return response.error('Account is not active. Please contact support.', 403);
        }

        // Update last login timestamp
        await dynamoService.updateLastLogin(dbUser.userId);

        // Return tokens and user information
        return response.success({
            message: 'Login successful',
            tokens: {
                accessToken: authResult.AccessToken,
                refreshToken: authResult.RefreshToken,
                idToken: authResult.IdToken,
                expiresIn: authResult.ExpiresIn,
                tokenType: authResult.TokenType
            },
            user: {
                userId: dbUser.userId,
                email: dbUser.email,
                name: dbUser.name,
                phoneNumber: dbUser.phoneNumber,
                userType: dbUser.userType,
                status: dbUser.status,
                emailVerified: dbUser.emailVerified,
                profileCompleted: dbUser.profileCompleted,
                lastLoginAt: new Date().toISOString()
            }
        });

    } catch (err) {
        console.error('Login error:', err);

        // Return generic error for security (don't reveal if user exists)
        return response.error('Invalid credentials', 401);
    }
};