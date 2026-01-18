const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');
        const cognitoUser = await verifyToken(accessToken);
        const dbUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!dbUser) {
            return response.error('User not found', 404);
        }

        if (dbUser.status !== 'active') {
            return response.error('Account is not active', 403);
        }

        // Get properties for this owner
        const result = await propertyService.getPropertiesByOwner(dbUser.userId);

        return response.success({
            message: 'Properties retrieved successfully',
            properties: result.properties,
            count: result.properties.length
        });

    } catch (err) {
        console.error('Get properties error:', err);
        return response.error('Failed to retrieve properties', 500);
    }
};