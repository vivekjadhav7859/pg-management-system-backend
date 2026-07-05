const tenantService = require('../../services/tenant.service');
const financialService = require('../../services/financial.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'tenant') {
            return response.error('Only tenants can pay rent', 403);
        }

        const body = JSON.parse(event.body || '{}');
        const { paymentId, paymentMode = 'online', transactionId } = body;
        if (!paymentId) return response.error('paymentId is required', 400);

        const tenant = await tenantService.getTenantByUserId(dbUser.userId);
        if (!tenant) return response.error('Active tenant profile not found', 404);

        const payment = await financialService.getRentPaymentById(paymentId);
        if (!payment || payment.tenantId !== tenant.tenantId) {
            return response.error('Payment not found for this tenant', 404);
        }

        const updated = await financialService.updateRentPayment(paymentId, {
            paymentStatus: 'completed',
            paymentDate: new Date().toISOString(),
            transactionId: transactionId || `TENANT-${Date.now()}`,
            transactionRef: paymentMode,
            notes: 'Tenant confirmed online payment',
        });

        return response.success({
            message: 'Payment completed successfully',
            payment: updated,
        });
    } catch (err) {
        console.error('[payRent]', err);
        return response.error('Failed to complete payment', 500);
    }
};
