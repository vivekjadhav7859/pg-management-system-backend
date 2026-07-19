
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const financialService = require('../../services/financial.service');
const response = require('../../utils/response');
const { sanitizeInput } = require('../../utils/validator');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');

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

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        const body = JSON.parse(event.body);
        const updates = {};

        if (body.amount !== undefined) updates.amount = body.amount;
        if (body.description !== undefined) updates.description = sanitizeInput(body.description);
        if (body.notes !== undefined) updates.notes = sanitizeInput(body.notes);

        if (Object.keys(updates).length === 0) {
            return response.error('No valid fields to update', 400);
        }

        const updatedExpense = await financialService.updateExpense(expenseId, updates);

        return response.success({
            message: 'Expense updated successfully',
            expense: updatedExpense
        });

    } catch (err) {
        console.error('Update expense error:', err);
        return response.error('Failed to update expense', 500);
    }
};
