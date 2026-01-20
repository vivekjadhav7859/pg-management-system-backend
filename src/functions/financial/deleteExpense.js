const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const financialService = require('../../services/financial.service');
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

        if (!dbUser || dbUser.status !== 'active') {
            return response.error('User not found or not active', 403);
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
