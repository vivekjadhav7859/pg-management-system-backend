const AWS = require('aws-sdk');
const config = require('../config/env');

const cognito = new AWS.CognitoIdentityServiceProvider({
    region: config.AWS_REGION
});

/**
 * Create a new user in Cognito
 */
const createUser = async (email, password) => {
    try {
        // Create user in Cognito
        await cognito.adminCreateUser({
            UserPoolId: config.USER_POOL_ID,
            Username: email,
            UserAttributes: [
                { Name: 'email', Value: email },
                { Name: 'email_verified', Value: 'true' }
            ],
            MessageAction: 'SUPPRESS',
        }).promise();

        // Set permanent password
        await cognito.adminSetUserPassword({
            UserPoolId: config.USER_POOL_ID,
            Username: email,
            Password: password,
            Permanent: true,
        }).promise();

        return {
            success: true,
            email
        };
    } catch (error) {
        // Handle specific Cognito errors
        if (error.code === 'UsernameExistsException') {
            throw new Error('User already exists with this email');
        }
        if (error.code === 'InvalidPasswordException') {
            throw new Error('Password does not meet requirements (min 8 chars, uppercase, lowercase, number, symbol)');
        }
        if (error.code === 'InvalidParameterException') {
            throw new Error('Invalid email or password format');
        }
        throw error;
    }
};

/**
 * Login user and return tokens
 */
const loginUser = async (email, password) => {
    try {
        const result = await cognito.adminInitiateAuth({
            UserPoolId: config.USER_POOL_ID,
            ClientId: config.USER_POOL_CLIENT_ID,
            AuthFlow: 'ADMIN_NO_SRP_AUTH',
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password,
            },
        }).promise();

        return result.AuthenticationResult;
    } catch (error) {
        if (error.code === 'NotAuthorizedException') {
            throw new Error('Invalid email or password');
        }
        if (error.code === 'UserNotFoundException') {
            throw new Error('User not found');
        }
        if (error.code === 'UserNotConfirmedException') {
            throw new Error('User account is not confirmed');
        }
        throw error;
    }
};

/**
 * Verify JWT token
 */
const verifyToken = async (token) => {
    try {
        const result = await cognito.getUser({
            AccessToken: token
        }).promise();

        return {
            username: result.Username,
            email: result.UserAttributes.find(attr => attr.Name === 'email')?.Value,
            attributes: result.UserAttributes
        };
    } catch (error) {
        throw new Error('Invalid or expired token');
    }
};

/**
 * Refresh access token
 */
const refreshToken = async (refreshToken) => {
    try {
        const result = await cognito.adminInitiateAuth({
            UserPoolId: config.USER_POOL_ID,
            ClientId: config.USER_POOL_CLIENT_ID,
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            AuthParameters: {
                REFRESH_TOKEN: refreshToken,
            },
        }).promise();

        return result.AuthenticationResult;
    } catch (error) {
        throw new Error('Invalid or expired refresh token');
    }
};

/**
 * Logout user (revoke tokens)
 */
const logoutUser = async (accessToken) => {
    try {
        await cognito.globalSignOut({
            AccessToken: accessToken
        }).promise();

        return { message: 'Logged out successfully' };
    } catch (error) {
        throw new Error('Logout failed');
    }
};

/**
 * Get user details by username
 */
const getUserDetails = async (username) => {
    try {
        const result = await cognito.adminGetUser({
            UserPoolId: config.USER_POOL_ID,
            Username: username
        }).promise();

        return {
            username: result.Username,
            enabled: result.Enabled,
            status: result.UserStatus,
            attributes: result.UserAttributes
        };
    } catch (error) {
        throw new Error('Failed to fetch user details');
    }
};

// Export for esbuild compatibility
exports.createUser = createUser;
exports.loginUser = loginUser;
exports.verifyToken = verifyToken;
exports.refreshToken = refreshToken;
exports.logoutUser = logoutUser;
exports.getUserDetails = getUserDetails;