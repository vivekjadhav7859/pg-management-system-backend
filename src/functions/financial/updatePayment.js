
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

        const paymentId = event.pathParameters.paymentId;
        const payment = await financialService.getRentPaymentById(paymentId);

        if (!payment) {
            return response.error('Payment not found', 404);
        }

        // Verify property ownership
        const property = await propertyService.getPropertyById(payment.propertyId);
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('Unauthorized', 403);
        }

        const body = JSON.parse(event.body);
        const updates = {};

        if (body.paymentStatus !== undefined) {
            const validStatuses = ['pending', 'completed', 'failed', 'overdue'];
            if (!validStatuses.includes(body.paymentStatus)) {
                return response.error('Invalid payment status', 400);
            }
            updates.paymentStatus = body.paymentStatus;
        }

        if (body.transactionId !== undefined) updates.transactionId = body.transactionId;
        if (body.transactionRef !== undefined) updates.transactionRef = body.transactionRef;
        if (body.notes !== undefined) updates.notes = body.notes;
        if (body.lateFee !== undefined) updates.lateFee = body.lateFee;
        if (body.discount !== undefined) updates.discount = body.discount;

        if (Object.keys(updates).length === 0) {
            return response.error('No valid fields to update', 400);
        }

        const updatedPayment = await financialService.updateRentPayment(paymentId, updates);

        return response.success({
            message: 'Payment updated successfully',
            payment: updatedPayment
        });

    } catch (err) {
        console.error('Update payment error:', err);
        return response.error('Failed to update payment', 500);
    }
};
