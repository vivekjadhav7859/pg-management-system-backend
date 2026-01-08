const { loginUser } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
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

        // Get user details from DynamoDB
        const dbUser = await dynamoService.getUserByEmail(sanitizedEmail);

        if (!dbUser) {
            console.warn('User authenticated but not found in database:', sanitizedEmail);
            return response.error('User data not found', 404);
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