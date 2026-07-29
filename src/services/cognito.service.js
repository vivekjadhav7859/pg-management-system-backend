const {
    CognitoIdentityProviderClient,
    AdminSetUserPasswordCommand,
    AdminCreateUserCommand,
    AdminUpdateUserAttributesCommand,
    AdminInitiateAuthCommand,
    AdminGetUserCommand,
    SignUpCommand,
    ConfirmSignUpCommand,
    ResendConfirmationCodeCommand,
    ForgotPasswordCommand,
    ConfirmForgotPasswordCommand,
    GlobalSignOutCommand,
    GetUserCommand
} = require('@aws-sdk/client-cognito-identity-provider');

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;

const setPermanentPassword = async (email, password) => {
    const command = new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        Password: password,
        Permanent: true
    });
    await cognitoClient.send(command);
};

exports.setUserPassword = setPermanentPassword;

/**
 * Create a new user in Cognito with custom attributes
 */
exports.createUser = async (email, password, userAttributes = {}) => {
    try {
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

        const command = new AdminCreateUserCommand(params);
        const createUserResponse = await cognitoClient.send(command);

        // Set permanent password
        await setPermanentPassword(email, password);

        return {
            userId: createUserResponse.User.Username,
            email: email,
            userAttributes: createUserResponse.User.Attributes
        };

    } catch (error) {
        console.error('Error creating user in Cognito:', error);
        
        if (error.name === 'UsernameExistsException' || error.code === 'UsernameExistsException') {
            const usernameExistsError = new Error('User with this email already exists');
            usernameExistsError.code = 'UsernameExistsException';
            throw usernameExistsError;
        }
        
        throw error;
    }
};

/**
 * Create a user in Cognito for invitation flow (unconfirmed, email_verified: false, suppressed welcome email)
 */
exports.createInvitedUser = async (email, userAttributes = {}) => {
    try {
        const crypto = require('crypto');
        const tempPassword = `Inv!te_${crypto.randomBytes(8).toString('hex')}A1!`;
        const params = {
            UserPoolId: USER_POOL_ID,
            Username: email,
            TemporaryPassword: tempPassword,
            UserAttributes: [
                { Name: 'email', Value: email },
                { Name: 'email_verified', Value: 'false' }
            ],
            MessageAction: 'SUPPRESS'
        };

        if (userAttributes.name) {
            params.UserAttributes.push({ Name: 'name', Value: userAttributes.name });
        }
        if (userAttributes.phone_number) {
            params.UserAttributes.push({ Name: 'phone_number', Value: userAttributes.phone_number });
        }

        const command = new AdminCreateUserCommand(params);
        const response = await cognitoClient.send(command);
        return {
            userId: response.User.Username,
            email: email,
            userAttributes: response.User.Attributes
        };
    } catch (error) {
        console.error('Error creating invited user in Cognito:', error);
        if (error.name === 'UsernameExistsException' || error.code === 'UsernameExistsException') {
            const usernameExistsError = new Error('User with this email already exists');
            usernameExistsError.code = 'UsernameExistsException';
            throw usernameExistsError;
        }
        throw error;
    }
};

/**
 * Update user attributes in Cognito (e.g. set email_verified to true)
 */
exports.updateUserAttributes = async (email, attributes = []) => {
    try {
        const params = {
            UserPoolId: USER_POOL_ID,
            Username: email,
            UserAttributes: attributes
        };
        const command = new AdminUpdateUserAttributesCommand(params);
        await cognitoClient.send(command);
    } catch (error) {
        console.error('Error updating user attributes in Cognito:', error);
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

        const command = new AdminInitiateAuthCommand(params);
        const response = await cognitoClient.send(command);

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

        const command = new AdminGetUserCommand(params);
        const response = await cognitoClient.send(command);

        // Convert attributes array to object
        const attributes = {};
        if (response.UserAttributes) {
            response.UserAttributes.forEach(attr => {
                attributes[attr.Name] = attr.Value;
            });
        }

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

        const command = new AdminInitiateAuthCommand(params);
        const response = await cognitoClient.send(command);

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

        const command = new SignUpCommand(params);
        const response = await cognitoClient.send(command);
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
        const command = new ConfirmSignUpCommand(params);
        await cognitoClient.send(command);
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
        const command = new ResendConfirmationCodeCommand(params);
        await cognitoClient.send(command);
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
        const command = new ForgotPasswordCommand(params);
        await cognitoClient.send(command);
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
        const command = new ConfirmForgotPasswordCommand(params);
        await cognitoClient.send(command);
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

        const command = new GlobalSignOutCommand(params);
        await cognitoClient.send(command);

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

        const command = new GetUserCommand(params);
        const response = await cognitoClient.send(command);

        // Convert attributes array to object
        const attributes = {};
        if (response.UserAttributes) {
            response.UserAttributes.forEach(attr => {
                attributes[attr.Name] = attr.Value;
            });
        }

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
