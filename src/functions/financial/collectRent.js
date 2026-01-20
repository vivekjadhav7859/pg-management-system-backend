const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const financialService = require('../../services/financial.service');
const response = require('../../utils/response');
const { validateRequiredFields } = require('../../utils/validator');

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

        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can collect rent', 403);
        }

        const body = JSON.parse(event.body);
        const { 
            tenantId, amount, paymentMonth, dueDate,
            paymentMode, paymentStatus, transactionId,
            transactionRef, lateFee, discount, notes
        } = body;

        const requiredValidation = validateRequiredFields(body, [
            'tenantId', 'amount', 'paymentMonth', 'paymentMode'
        ]);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        // Verify tenant exists
        const tenant = await tenantService.getTenantById(tenantId);
        if (!tenant) {
            return response.error('Tenant not found', 404);
        }

        // Verify property ownership
        const property = await propertyService.getPropertyById(tenant.propertyId);
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only collect rent from your properties', 403);
        }

        // Validate payment mode
        const validModes = ['online', 'offline', 'cash', 'cheque', 'bank_transfer'];
        if (!validModes.includes(paymentMode)) {
            return response.error('Invalid payment mode', 400);
        }

        // Generate receipt number
        const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        // Create rent payment
        const payment = await financialService.createRentPayment({
            tenantId,
            propertyId: tenant.propertyId,
            roomId: tenant.roomId,
            amount,
            paymentMonth,
            dueDate: dueDate || null,
            paymentMode,
            paymentStatus: paymentStatus || 'completed',
            transactionId: transactionId || null,
            transactionRef: transactionRef || null,
            receiptNumber,
            lateFee: lateFee || 0,
            discount: discount || 0,
            notes: notes || null
        });

        console.log('Rent payment recorded:', payment.paymentId);

        return response.success({
            message: 'Rent payment recorded successfully',
            payment: {
                paymentId: payment.paymentId,
                tenantId: payment.tenantId,
                amount: payment.amount,
                finalAmount: payment.finalAmount,
                paymentMonth: payment.paymentMonth,
                paymentDate: payment.paymentDate,
                paymentMode: payment.paymentMode,
                paymentStatus: payment.paymentStatus,
                receiptNumber: payment.receiptNumber,
                createdAt: payment.createdAt
            }
        }, 201);

    } catch (err) {
        console.error('Collect rent error:', err);
        return response.error('Failed to record rent payment', 500);
    }
};