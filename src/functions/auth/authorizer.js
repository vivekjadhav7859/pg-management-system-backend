const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');

const generatePolicy = (principalId, effect, resource, context) => {
    const authResponse = { principalId };
    
    if (effect && resource) {
        const policyDocument = {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    Resource: resource
                }
            ]
        };
        authResponse.policyDocument = policyDocument;
    }
    
    // Stringify context values as required by API Gateway context
    if (context) {
        authResponse.context = {
            userId: String(context.userId),
            userType: String(context.userType),
            email: String(context.email),
            status: String(context.status || 'active')
        };
    }
    
    return authResponse;
};

exports.handler = async (event) => {
    try {
        const token = event.authorizationToken;
        if (!token) {
            throw new Error('Unauthorized');
        }

        const accessToken = token.replace('Bearer ', '');
        const cognitoUser = await verifyToken(accessToken);
        const dbUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!dbUser || dbUser.status !== 'active') {
            throw new Error('Unauthorized');
        }

        return generatePolicy(dbUser.userId, 'Allow', event.methodArn, {
            userId: dbUser.userId,
            userType: dbUser.userType,
            email: dbUser.email,
            status: dbUser.status
        });

    } catch (err) {
        console.error('Authorizer error:', err);
        throw new Error('Unauthorized'); // Triggers 401 response from API Gateway
    }
};
