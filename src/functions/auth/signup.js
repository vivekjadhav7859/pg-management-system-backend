const { createUser, getUserDetails, setUserPassword } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');
const { validateEmail, validatePassword, validateRequiredFields, sanitizeInput } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        console.log('Signup request received');

        // Parse request body
        const body = JSON.parse(event.body);
        const { email, password, name, phone, userType } = body;

        // Validate required fields
        const requiredValidation = validateRequiredFields(body, ['email', 'password', 'userType']);
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
        const sanitizedUserType = userType ? sanitizeInput(userType) : null;

        // SECURITY: Only allow tenant and owner roles in public signup
        // Admin users must be created through the protected createAdmin endpoint
        const validUserTypes = ['tenant', 'owner'];
        if (!validUserTypes.includes(sanitizedUserType)) {
            return response.error('Invalid user type. Must be tenant or owner', 400);
        }

        // Check if user already exists in DynamoDB
        const existingUser = await dynamoService.getUserByEmail(sanitizedEmail);
        if (existingUser) {
            return response.error('User with this email already exists', 409);
        }

        // Create user in Cognito with custom attributes
        let cognitoUser;
        try {
            cognitoUser = await createUser(
                sanitizedEmail, 
                password,
                {
                    name: sanitizedName,
                    phone_number: sanitizedPhone,
                    userType: sanitizedUserType
                }
            );
        } catch (err) {
            if (err.code !== 'UsernameExistsException') {
                throw err;
            }

            const existingDbUser = await dynamoService.getUserByEmail(sanitizedEmail);
            if (existingDbUser) {
                throw err;
            }

            console.warn('Cognito user exists without database profile. Recreating database profile:', sanitizedEmail);
            const existingCognitoUser = await getUserDetails(sanitizedEmail);
            await setUserPassword(sanitizedEmail, password);
            const repairedUser = await dynamoService.createUser({
                cognitoUserId: existingCognitoUser.userId,
                email: sanitizedEmail,
                name: sanitizedName || existingCognitoUser.name,
                phoneNumber: sanitizedPhone || existingCognitoUser.phoneNumber,
                userType: sanitizedUserType
            });

            return response.success({
                message: 'User registered successfully',
                user: {
                    userId: repairedUser.userId,
                    email: repairedUser.email,
                    name: repairedUser.name,
                    phoneNumber: repairedUser.phoneNumber,
                    userType: repairedUser.userType,
                    status: repairedUser.status,
                    createdAt: repairedUser.createdAt
                }
            }, 201);
        }

        console.log('Cognito user created:', cognitoUser.userId);

        // Create user entry in DynamoDB
        const dbUser = await dynamoService.createUser({
            cognitoUserId: cognitoUser.userId,
            email: sanitizedEmail,
            name: sanitizedName,
            phoneNumber: sanitizedPhone,
            userType: sanitizedUserType
        });

        console.log('User created successfully in database:', dbUser.userId);

        return response.success({
            message: 'User registered successfully',
            user: {
                userId: dbUser.userId,
                email: dbUser.email,
                name: dbUser.name,
                phoneNumber: dbUser.phoneNumber,
                userType: dbUser.userType,
                status: dbUser.status,
                createdAt: dbUser.createdAt
            }
        }, 201);

    } catch (err) {
        console.error('Signup error:', err);

        // Handle specific error messages
        let errorMessage = 'Signup failed';
        let statusCode = 400;

        if (err.message?.includes('already exists')) {
            errorMessage = err.message;
            statusCode = 409;
        } else if (err.message) {
            errorMessage = err.message;
        }

        return response.error(errorMessage, statusCode);
    }
};
