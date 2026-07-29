const AWS = require('aws-sdk');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const financialService = require('../../services/financial.service');
const notificationService = require('../../services/notification.service');
const response = require('../../utils/response');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');

/**
 * POST /financial/send-reminder
 * Sends rent reminder/receipt/overdue emails to tenants using AWS SES transparent platform.
 */
exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can send reminders', 403);
        }

        const body = JSON.parse(event.body || '{}');
        const { tenantId, paymentId, type } = body;

        if (!tenantId) {
            return response.error('tenantId is required', 400);
        }

        // Get tenant details
        const tenant = await tenantService.getTenantById(tenantId);
        if (!tenant) {
            return response.error('Tenant not found', 404);
        }

        if (!tenant.email) {
            return response.error('Tenant has no email address registered', 400);
        }

        // Verify property ownership
        const property = await propertyService.getPropertyById(tenant.propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only send reminders to your tenants', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        // Get payment details if paymentId provided
        let payment = null;
        if (paymentId) {
            payment = await financialService.getRentPaymentById(paymentId);
        }

        // Get room details
        let roomNo = tenant.roomId || 'N/A';
        try {
            if (tenant.roomId) {
                const roomParams = {
                    TableName: process.env.ROOM_TABLE,
                    Key: { roomId: tenant.roomId }
                };
                const dynamodb = new AWS.DynamoDB.DocumentClient();
                const roomResult = await dynamodb.get(roomParams).promise();
                if (roomResult.Item && roomResult.Item.roomNumber) {
                    roomNo = roomResult.Item.roomNumber;
                }
            }
        } catch (err) {
            console.error('Error fetching room:', err.message);
        }

        const amount = payment ? payment.amount : tenant.rentAmount || 0;
        const dueDate = payment && payment.dueDate 
            ? new Date(payment.dueDate).toLocaleDateString('en-IN')
            : 'upcoming';

        const reminderType = type || 'payment';
        const paymentMode = body.paymentMode || (payment ? payment.paymentMode : 'cash');
        const receiptNumber = payment ? (payment.receiptNumber || `RCP-${paymentId}`) : `RCP-${Date.now()}`;
        const paymentDateStr = payment && payment.paymentDate
            ? new Date(payment.paymentDate).toLocaleDateString('en-IN')
            : new Date().toLocaleDateString('en-IN');
        const monthStr = payment ? (payment.paymentMonth || new Date().toISOString().slice(0, 7)) : new Date().toISOString().slice(0, 7);

        let eventType = 'RENT_REMINDER';
        if (reminderType === 'receipt') {
            eventType = 'PAYMENT_RECEIPT';
        } else if (reminderType === 'overdue') {
            eventType = 'OVERDUE_REMINDER';
        }

        const templateData = {
            tenantName: tenant.name || 'Tenant',
            ownerName: dbUser.name || property.propertyName,
            propertyName: property.propertyName,
            roomNumber: roomNo,
            rentAmount: amount,
            dueDate,
            receiptNumber,
            paymentDate: paymentDateStr,
            paymentMode,
            monthStr
        };

        const result = await notificationService.sendNotification({
            type: eventType,
            ownerId: property.ownerId,
            tenantId: tenant.tenantId,
            tenantEmail: tenant.email,
            replyTo: dbUser.email || undefined,
            propertyId: property.propertyId,
            data: templateData
        });

        if (!result.sent) {
            return response.error(result.reason || 'Failed to send reminder via notification platform', 500);
        }

        return response.success({
            message: 'Reminder sent successfully',
            tenantId: tenantId,
            tenantName: tenant.name,
            logId: result.logId,
            reminderType: reminderType
        });

    } catch (err) {
        console.error('sendReminder error:', err);
        return response.error('Failed to send reminder', 500);
    }
};
