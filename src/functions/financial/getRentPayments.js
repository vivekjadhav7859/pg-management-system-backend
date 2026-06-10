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

        const propertyId = event.pathParameters.propertyId;

        // Verify property ownership
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only view payments of your properties', 403);
        }

        // Optional ?month=YYYY-MM filter
        const month = event.queryStringParameters?.month;

        let payments;
        if (month && /^\d{4}-\d{2}$/.test(month)) {
            // Filter by specific month using the PaymentMonthIndex GSI
            payments = await financialService.getRentPaymentsByMonth(propertyId, month);
        } else {
            // Return all payments for this property (default behaviour)
            const result = await financialService.getRentPaymentsByProperty(propertyId);
            payments = result.payments;
        }

        // Auto-upgrade 'pending' → 'overdue' for bills past the 5th (in-memory only, not persisted here)
        const today = new Date();
        payments = payments.map(p => {
            if (p.paymentStatus === 'pending' && p.dueDate) {
                const due = new Date(p.dueDate);
                if (today > due) {
                    return { ...p, paymentStatus: 'overdue' };
                }
            }
            return p;
        });

        return response.success({
            message: 'Rent payments retrieved successfully',
            payments,
            count: payments.length,
            propertyId,
            month: month || null
        });

    } catch (err) {
        console.error('Get rent payments error:', err);
        return response.error('Failed to retrieve rent payments', 500);
    }
};