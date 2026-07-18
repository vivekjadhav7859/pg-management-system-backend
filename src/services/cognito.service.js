const AWS = require('aws-sdk');

const cognito = new AWS.CognitoIdentityServiceProvider();
const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;

const setPermanentPassword = async (email, password) => {
    await cognito.adminSetUserPassword({
        UserPoolId: USER_POOL_ID,
        Username: email,
        Password: password,
        Permanent: true
    }).promise();
};

exports.setUserPassword = setPermanentPassword;

/**
 * Create a new user in Cognito with custom attributes
 */
exports.createUser = async (email, password, userAttributes = {}) => {
    try {
        // Create user in Cognito
        const params = {
            UserPoolId: USER_POOL_ID,
            Username: email,
            TemporaryPassword: password,
            UserAttributes: [
                {
                    Name: 'email',
                    Value: email
                },
                {
                    Name: 'email_verified',
                    Value: 'true'
                }
            ],
            MessageAction: 'SUPPRESS' // Don't send welcome email
        };

        // Add custom attributes if provided
        if (userAttributes.name) {
            params.UserAttributes.push({
                Name: 'name',
                Value: userAttributes.name
            });
        }

        if (userAttributes.phone_number) {
            params.UserAttributes.push({
                Name: 'phone_number',
                Value: userAttributes.phone_number
            });
        }

        // Note: userType is stored only in DynamoDB, not in Cognito

        const createUserResponse = await cognito.adminCreateUser(params).promise();

        // Set permanent password
        await setPermanentPassword(email, password);

        return {
            userId: createUserResponse.User.Username,
            email: email,
            userAttributes: createUserResponse.User.Attributes
        };

    } catch (error) {
        console.error('Error creating user in Cognito:', error);
        
        if (error.code === 'UsernameExistsException') {
            const usernameExistsError = new Error('User with this email already exists');
            usernameExistsError.code = error.code;
            throw usernameExistsError;
        }
        
        throw error;
    }
};

/**
 * Login user and return authentication tokens
 */
exports.loginUser = async (email, password) => {
    try {
        const params = {
            AuthFlow: 'ADMIN_NO_SRP_AUTH',
            UserPoolId: USER_POOL_ID,
            ClientId: USER_POOL_CLIENT_ID,
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password
            }
        };

        const response = await cognito.adminInitiateAuth(params).promise();

        return response.AuthenticationResult;

    } catch (error) {
        console.error('Error logging in user:', error);
        throw error;
    }
};

/**
 * Get user details from Cognito
 */
exports.getUserDetails = async (email) => {
    try {
        const params = {
            UserPoolId: USER_POOL_ID,
            Username: email
        };

        const response = await cognito.adminGetUser(params).promise();

        // Convert attributes array to object
        const attributes = {};
        response.UserAttributes.forEach(attr => {
            attributes[attr.Name] = attr.Value;
        });

        return {
            userId: response.Username,
            email: attributes.email,
            name: attributes.name || null,
            phoneNumber: attributes.phone_number || null,
            emailVerified: attributes.email_verified === 'true',
            enabled: response.Enabled,
            userStatus: response.UserStatus,
            createdAt: response.UserCreateDate,
            lastModifiedAt: response.UserLastModifiedDate
        };

    } catch (error) {
        console.error('Error getting user details:', error);
        throw error;
    }
};

/**
 * Refresh authentication token
 */
exports.refreshToken = async (refreshToken) => {
    try {
        const params = {
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            UserPoolId: USER_POOL_ID,
            ClientId: USER_POOL_CLIENT_ID,
            AuthParameters: {
                REFRESH_TOKEN: refreshToken
            }
        };

        const response = await cognito.adminInitiateAuth(params).promise();

        return response.AuthenticationResult;

    } catch (error) {
        console.error('Error refreshing token:', error);
        throw error;
    }
};

/**
 * Sign up a new user (client-side flow — sends verification email)
 */
exports.signUpUser = async (email, password, userAttributes = {}) => {
    try {
        const attributes = [
            { Name: 'email', Value: email }
        ];

        if (userAttributes.name) {
            attributes.push({ Name: 'name', Value: userAttributes.name });
        }
        if (userAttributes.phone_number) {
            attributes.push({ Name: 'phone_number', Value: userAttributes.phone_number });
        }

        const params = {
            ClientId: USER_POOL_CLIENT_ID,
            Username: email,
            Password: password,
            UserAttributes: attributes
        };

        const response = await cognito.signUp(params).promise();
        return {
            userId: response.UserSub,
            email: email,
            confirmed: response.UserConfirmed
        };
    } catch (error) {
        console.error('Error signing up user:', error);
        throw error;
    }
};

/**
 * Confirm user email with OTP code from verification email
 */
exports.confirmUserEmail = async (email, confirmationCode) => {
    try {
        const params = {
            ClientId: USER_POOL_CLIENT_ID,
            Username: email,
            ConfirmationCode: confirmationCode
        };
        await cognito.confirmSignUp(params).promise();
    } catch (error) {
        console.error('Error confirming user email:', error);
        throw error;
    }
};

/**
 * Resend email verification code
 */
exports.resendConfirmationCode = async (email) => {
    try {
        const params = {
            ClientId: USER_POOL_CLIENT_ID,
            Username: email
        };
        await cognito.resendConfirmationCode(params).promise();
    } catch (error) {
        console.error('Error resending confirmation code:', error);
        throw error;
    }
};

/**
 * Initiate forgot password flow — sends OTP to user's email
 */
exports.forgotPassword = async (email) => {
    try {
        const params = {
            ClientId: USER_POOL_CLIENT_ID,
            Username: email
        };
        await cognito.forgotPassword(params).promise();
    } catch (error) {
        console.error('Error initiating forgot password:', error);
        throw error;
    }
};

/**
 * Confirm forgot password — verifies OTP and sets new password
 */
exports.confirmForgotPassword = async (email, confirmationCode, newPassword) => {
    try {
        const params = {
            ClientId: USER_POOL_CLIENT_ID,
            Username: email,
            ConfirmationCode: confirmationCode,
            Password: newPassword
        };
        await cognito.confirmForgotPassword(params).promise();
    } catch (error) {
        console.error('Error confirming forgot password:', error);
        throw error;
    }
};

/**
 * Logout user (global sign out)
 */
exports.logoutUser = async (accessToken) => {
    try {
        const params = {
            AccessToken: accessToken
        };

        await cognito.globalSignOut(params).promise();

    } catch (error) {
        console.error('Error logging out user:', error);
        throw error;
    }
};

/**
 * Verify access token and return user info
 */
exports.verifyToken = async (accessToken) => {
    try {
        const params = {
            AccessToken: accessToken
        };

        const response = await cognito.getUser(params).promise();

        // Convert attributes array to object
        const attributes = {};
        response.UserAttributes.forEach(attr => {
            attributes[attr.Name] = attr.Value;
        });

        return {
            userId: response.Username,
            email: attributes.email,
            name: attributes.name || null,
            phoneNumber: attributes.phone_number || null,
            emailVerified: attributes.email_verified === 'true'
        };

    } catch (error) {
        console.error('Error verifying token:', error);
        throw error;
    }
};
