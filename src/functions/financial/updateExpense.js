
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

        if (body.expenseType !== undefined) updates.expenseType = sanitizeInput(body.expenseType);
        if (body.category !== undefined) updates.category = sanitizeInput(body.category);
        if (body.amount !== undefined) updates.amount = body.amount;
        if (body.expenseDate !== undefined) updates.expenseDate = body.expenseDate;
        if (body.expenseMonth !== undefined) updates.expenseMonth = body.expenseMonth;
        if (body.paymentMode !== undefined) updates.paymentMode = sanitizeInput(body.paymentMode);
        if (body.paidTo !== undefined) updates.paidTo = sanitizeInput(body.paidTo);
        if (body.billNumber !== undefined) updates.billNumber = sanitizeInput(body.billNumber);
        if (body.description !== undefined) updates.description = sanitizeInput(body.description);
        if (body.notes !== undefined) updates.notes = sanitizeInput(body.notes);
        if (body.recurring !== undefined) updates.recurring = Boolean(body.recurring);
        if (body.frequency !== undefined) updates.frequency = sanitizeInput(body.frequency);

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
