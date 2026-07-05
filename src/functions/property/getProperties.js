
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');
const { withSignedImageUrlsList } = require('../../utils/propertyImages');

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
        const properties = withSignedImageUrlsList(result.properties);

        return response.success({
            message: 'Properties retrieved successfully',
            properties,
            count: properties.length
        });

    } catch (err) {
        console.error('Get properties error:', err);
        return response.error('Failed to retrieve properties', 500);
    }
};
