
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
        const month = event.queryStringParameters?.month; // YYYY-MM format

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return response.error('Valid month (YYYY-MM) is required', 400);
        }

        // Verify property ownership
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only generate reports for your properties', 403);
        }

        const report = await financialService.getMonthlyFinancialReport(propertyId, month);

        return response.success({
            message: 'Financial report generated successfully',
            report: report
        });

    } catch (err) {
        console.error('Generate report error:', err);
        return response.error('Failed to generate report', 500);
    }
};