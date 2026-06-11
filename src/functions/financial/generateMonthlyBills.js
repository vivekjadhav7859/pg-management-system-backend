const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const financialService = require('../../services/financial.service');
const response = require('../../utils/response');

/**
 * Generate monthly rent bills for all active tenants of a property.
 * - Bill date : 1st of the month
 * - Due date  : 5th of the month
 * - Status    : 'pending' initially; frontend / cron upgrades to 'overdue' after 5th
 *
 * Idempotent: skips tenants who already have a bill for the target month.
 *
 * Supports two invocation modes:
 *  1. HTTP POST  /financial/generate-bills  (manual trigger from UI)
 *  2. EventBridge scheduled cron             (automatic on 1st of every month)
 */
exports.handler = async (event) => {
    try {
        // ── Determine invocation source ─────────────────────────────────────
        const isScheduled = event?.source === 'scheduled' || event?.source === 'aws.events';

        // ── Auth (skip for scheduled invocations) ────────────────────────────
        let dbUser = null;
        if (!isScheduled) {
            const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }
            if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
                return response.error('Only owners or admins can generate bills', 403);
            }
        }

        // ── Parse request body ────────────────────────────────────────────────
        let body = {};
        if (event.body) {
            try { body = JSON.parse(event.body); } catch (_) { /* ignore */ }
        }

        // Target month (YYYY-MM). Defaults to the current month.
        const now = new Date();
        const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const targetMonth = body.month || defaultMonth;

        if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
            return response.error('Invalid month format. Use YYYY-MM.', 400);
        }

        // Parse target year/month for due-date calculation
        const [yr, mo] = targetMonth.split('-').map(Number);
        const billDate = new Date(yr, mo - 1, 1).toISOString();  // 1st of month
        const dueDate  = new Date(yr, mo - 1, 5).toISOString();  // 5th of month

        // ── Determine which properties to process ─────────────────────────────
        let propertyIds = [];

        if (body.propertyId) {
            // Single property requested
            const property = await propertyService.getPropertyById(body.propertyId);
            if (!property) {
                return response.error('Property not found', 404);
            }
            // If not admin/scheduled, verify ownership
            if (!isScheduled && dbUser.userType !== 'admin' && property.ownerId !== dbUser.userId) {
                return response.error('You can only generate bills for your own properties', 403);
            }
            propertyIds = [body.propertyId];
        } else if (isScheduled || (dbUser && dbUser.userType === 'admin')) {
            // Scheduled or admin → process ALL active properties
            const AWS = require('aws-sdk');
            const dynamodb = new AWS.DynamoDB.DocumentClient();
            const PROPERTY_TABLE = process.env.PROPERTY_TABLE;

            const scanResult = await dynamodb.scan({
                TableName: PROPERTY_TABLE,
                FilterExpression: '#status = :active',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':active': 'active' }
            }).promise();

            propertyIds = (scanResult.Items || []).map(p => p.propertyId);
        } else {
            // Owner without propertyId — get their own properties
            const propsResult = await propertyService.getPropertiesByOwner(dbUser.userId);
            propertyIds = (propsResult.properties || []).map(p => p.propertyId);
        }

        // ── Generate bills ────────────────────────────────────────────────────
        let totalGenerated = 0;
        let totalSkipped   = 0;
        const details = [];

        for (const propertyId of propertyIds) {
            // Get all active tenants for this property
            const tenantsResult = await tenantService.getTenantsByProperty(propertyId);
            const tenants = (tenantsResult.tenants || []).filter(t => t.status === 'active');

            // Get existing bills for the target month
            const existingPayments = await financialService.getRentPaymentsByMonth(propertyId, targetMonth);
            const billedTenantIds  = new Set(existingPayments.map(p => p.tenantId));

            for (const tenant of tenants) {
                if (billedTenantIds.has(tenant.tenantId)) {
                    // Bill already exists for this tenant this month — skip
                    totalSkipped++;
                    continue;
                }

                const rentAmount = tenant.rentAmount || 0;

                // Generate a receipt/reference number for the bill
                const billRef = `BILL-${targetMonth}-${tenant.tenantId.slice(-6).toUpperCase()}`;

                await financialService.createRentPayment({
                    tenantId:      tenant.tenantId,
                    propertyId:    propertyId,
                    roomId:        tenant.roomId,
                    amount:        rentAmount,
                    paymentMonth:  targetMonth,
                    paymentDate:   billDate,      // Bill generation date (1st)
                    dueDate:       dueDate,        // Due date (5th)
                    paymentMode:   'pending',      // Not yet paid; used as placeholder
                    paymentStatus: 'pending',
                    receiptNumber: billRef,
                    lateFee:       0,
                    discount:      0,
                    notes:         `Auto-generated bill for ${targetMonth}. Due by 5th.`
                });

                totalGenerated++;
            }

            details.push({
                propertyId,
                tenantsProcessed: tenants.length,
                billsGenerated:   totalGenerated,
                billsSkipped:     totalSkipped
            });
        }

        const message = `Bills generated for ${targetMonth}: ${totalGenerated} new, ${totalSkipped} already existed.`;
        console.log('[generateMonthlyBills]', message);

        if (isScheduled) {
            // EventBridge doesn't use HTTP responses — just return a plain object
            return { statusCode: 200, body: message };
        }

        return response.success({
            message,
            month:          targetMonth,
            billDate:       billDate,
            dueDate:        dueDate,
            totalGenerated,
            totalSkipped,
            propertiesProcessed: propertyIds.length,
            details
        }, 201);

    } catch (err) {
        console.error('[generateMonthlyBills] Error:', err);
        if (event?.source === 'scheduled' || event?.source === 'aws.events') {
            throw err; // Let EventBridge see the failure
        }
        return response.error('Failed to generate monthly bills', 500);
    }
};
