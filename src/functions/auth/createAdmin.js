const { verifyToken } = require('../../services/cognito.service');
const { createUser } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');
const { validateEmail, validatePassword, validateRequiredFields, sanitizeInput } = require('../../utils/validator');

/**
 * Protected endpoint to create admin users
 * Only accessible by existing admin users
 */
exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        console.log('Create admin request received');

        // STEP 1: Verify the requesting user is an admin
        const authHeader = event.headers.Authorization || event.headers.authorization;

        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');

        // Verify token and get user info from Cognito
        const cognitoUser = await verifyToken(accessToken);

        // Get complete user details from DynamoDB to check role
        const requestingUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!requestingUser) {
            return response.error('Requesting user not found', 404);
        }

        // SECURITY CHECK: Only admins can create other admins
        if (requestingUser.userType !== 'admin') {
            return response.error('Unauthorized. Only admins can create admin users', 403);
        }

        // Check if requesting admin is active
        if (requestingUser.status !== 'active') {
            return response.error('Your account is not active', 403);
        }

        // STEP 2: Validate and create the new admin user
        const body = JSON.parse(event.body);
        const { email, password, name, phone } = body;

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

        // Check if user already exists
        const existingUser = await dynamoService.getUserByEmail(sanitizedEmail);
        if (existingUser) {
            return response.error('User with this email already exists', 409);
        }

        // Create admin user in Cognito
        const cognitoNewUser = await createUser(
            sanitizedEmail, 
            password,
            {
                name: sanitizedName,
                phone_number: sanitizedPhone,
                userType: 'admin'
            }
        );

        console.log('Cognito admin user created:', cognitoNewUser.userId);

        // Create admin user entry in DynamoDB
        const dbUser = await dynamoService.createUser({
            cognitoUserId: cognitoNewUser.userId,
            email: sanitizedEmail,
            name: sanitizedName,
            phoneNumber: sanitizedPhone,
            userType: 'admin'
        });

        console.log('Admin user created successfully by:', requestingUser.email);

        return response.success({
            message: 'Admin user created successfully',
            user: {
                userId: dbUser.userId,
                email: dbUser.email,
                name: dbUser.name,
                phoneNumber: dbUser.phoneNumber,
                userType: dbUser.userType,
                status: dbUser.status,
                createdAt: dbUser.createdAt
            },
            createdBy: {
                userId: requestingUser.userId,
                email: requestingUser.email
            }
        }, 201);

    } catch (err) {
        console.error('Create admin error:', err);

        // Handle specific error messages
        let errorMessage = 'Failed to create admin user';
        let statusCode = 500;

        if (err.message?.includes('already exists')) {
            errorMessage = err.message;
            statusCode = 409;
        } else if (err.message?.includes('Unauthorized') || err.message?.includes('expired')) {
            errorMessage = err.message;
            statusCode = 401;
        } else if (err.message) {
            errorMessage = err.message;
        }

        return response.error(errorMessage, statusCode);
    }
};