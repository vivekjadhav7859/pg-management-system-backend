
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
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