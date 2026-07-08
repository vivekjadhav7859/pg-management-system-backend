
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const financialService = require('../../services/financial.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        const expenseId = event.pathParameters.expenseId;
        const expense = await financialService.getExpenseById(expenseId);

        if (!expense) {
            return response.error('Expense not found', 404);
        }

        // Verify property ownership
        const property = await propertyService.getPropertyById(expense.propertyId);
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('Unauthorized', 403);
        }

        await financialService.deleteExpense(expenseId);

        return response.success({
            message: 'Expense deleted successfully',
            expenseId: expenseId
        });

    } catch (err) {
        console.error('Delete expense error:', err);
        return response.error('Failed to delete expense', 500);
    }
};
