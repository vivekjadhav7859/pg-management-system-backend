const AWS = require('aws-sdk');

const cognito = new AWS.CognitoIdentityServiceProvider();

const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID;

module.exports.createUser = async (email, password) => {
    await cognito.adminCreateUser({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' }
        ],
        MessageAction: 'SUPPRESS',
    }).promise();

    await cognito.adminSetUserPassword({
        UserPoolId: USER_POOL_ID,
        Username: email,
        Password: password,
        Permanent: true,
    }).promise();
};

module.exports.loginUser = async (email, password) => {
    const result = await cognito.adminInitiateAuth({
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
            USERNAME: email,
            PASSWORD: password,
        },
    }).promise();

    return result.AuthenticationResult;
};
