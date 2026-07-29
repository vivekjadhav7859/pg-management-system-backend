// Since Cognito is created via CloudFormation in serverless.yml,
// we get the values from environment variables set by CloudFormation

const config = {
    USER_POOL_ID: process.env.USER_POOL_ID,
    USER_POOL_CLIENT_ID: process.env.USER_POOL_CLIENT_ID,
    AWS_REGION: process.env.AWS_REGION || 'ap-south-1',
    STAGE: process.env.STAGE || 'dev'
};

// Validate required environment variables
const validateConfig = () => {
    const required = ['USER_POOL_ID', 'USER_POOL_CLIENT_ID'];
    const missing = required.filter(key => !config[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
};

validateConfig();

module.exports = config;