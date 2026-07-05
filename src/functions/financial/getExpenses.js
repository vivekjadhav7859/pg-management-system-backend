
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const financialService = require('../../services/financial.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        const propertyId = event.pathParameters.propertyId;

        // Verify property ownership
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only view expenses of your properties', 403);
        }

        const result = await financialService.getExpensesByProperty(propertyId);

        return response.success({
            message: 'Expenses retrieved successfully',
            expenses: result.expenses,
            count: result.expenses.length,
            propertyId: propertyId
        });

    } catch (err) {
        console.error('Get expenses error:', err);
        return response.error('Failed to retrieve expenses', 500);
    }
};