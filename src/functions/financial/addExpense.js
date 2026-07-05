
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const financialService = require('../../services/financial.service');
const response = require('../../utils/response');
const { validateRequiredFields, sanitizeInput } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can add expenses', 403);
        }

        const body = JSON.parse(event.body);
        const { 
            propertyId, expenseType, category, amount,
            expenseDate, expenseMonth, paymentMode,
            paidTo, billNumber, description, notes
        } = body;

        const requiredValidation = validateRequiredFields(body, [
            'propertyId', 'expenseType', 'category', 'amount', 'expenseMonth', 'paymentMode'
        ]);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        // Verify property ownership
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only add expenses to your properties', 403);
        }

        // Validate expense type
        const validTypes = ['utility', 'maintenance', 'salary', 'repair', 'other'];
        if (!validTypes.includes(expenseType)) {
            return response.error('Invalid expense type', 400);
        }

        // Create expense
        const expense = await financialService.createExpense({
            propertyId,
            expenseType,
            category: sanitizeInput(category),
            amount,
            expenseDate: expenseDate || new Date().toISOString(),
            expenseMonth,
            paymentMode,
            paidTo: paidTo ? sanitizeInput(paidTo) : null,
            billNumber: billNumber ? sanitizeInput(billNumber) : null,
            description: description ? sanitizeInput(description) : null,
            notes: notes ? sanitizeInput(notes) : null,
            createdBy: dbUser.userId
        });

        console.log('Expense added:', expense.expenseId);

        return response.success({
            message: 'Expense added successfully',
            expense: {
                expenseId: expense.expenseId,
                propertyId: expense.propertyId,
                expenseType: expense.expenseType,
                category: expense.category,
                amount: expense.amount,
                expenseDate: expense.expenseDate,
                expenseMonth: expense.expenseMonth,
                paymentMode: expense.paymentMode,
                createdAt: expense.createdAt
            }
        }, 201);

    } catch (err) {
        console.error('Add expense error:', err);
        return response.error('Failed to add expense', 500);
    }
};
