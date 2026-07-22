const AWS = require('aws-sdk');
const tenantService = require('../../services/tenant.service');
const propertyService = require('../../services/property.service');
const notificationService = require('../../services/notification.service');
const response = require('../../utils/response');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const USER_TABLE = process.env.USER_TABLE;

/**
 * POST /notifications/broadcast
 * Owner-only. Sends a custom notice to all active tenants (optionally filtered by propertyId).
 */
exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const authorizer = event.requestContext?.authorizer;
        if (!authorizer) return response.error('Unauthorized', 401);

        const userId = authorizer.userId;
        const userType = authorizer.userType;

        if (authorizer.status !== 'active') {
            return response.error('Account is not active', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        const body = JSON.parse(event.body || '{}');
        const { subject, message, propertyId } = body;

        if (!subject || !subject.trim()) return response.error('subject is required', 400);
        if (!message || !message.trim()) return response.error('message is required', 400);
        if (subject.length > 150) return response.error('subject must be 150 characters or less', 400);
        if (message.length > 2000) return response.error('message must be 2000 characters or less', 400);

        // Fetch owner details
        let ownerName = 'Property Manager';
        let ownerEmail = authorizer.email;
        try {
            const ownerResult = await dynamodb.get({ TableName: USER_TABLE, Key: { userId } }).promise();
            if (ownerResult.Item) {
                ownerName = ownerResult.Item.name || ownerName;
                ownerEmail = ownerResult.Item.email || ownerEmail;
            }
        } catch (_) {}

        // Fetch properties for this owner
        let propertiesToProcess = [];
        if (propertyId && propertyId !== 'all') {
            const prop = await propertyService.getPropertyById(propertyId);
            if (!prop) return response.error('Property not found', 404);
            if (prop.ownerId !== userId && userType !== 'admin') return response.error('Forbidden', 403);
            propertiesToProcess = [prop];
        } else {
            const result = await propertyService.getPropertiesByOwner(userId);
            propertiesToProcess = result ? (result.properties || []) : [];
        }

        if (propertiesToProcess.length === 0) {
            return response.success({ sent: 0, failed: 0, total: 0, message: 'No properties found' });
        }

        let totalSent = 0;
        let totalFailed = 0;

        for (const prop of propertiesToProcess) {
            if (!prop || !prop.propertyId) continue;

            // Fetch active tenants for this property
            let allTenants = [];
            let lastKey = null;
            do {
                const result = await tenantService.getTenantsByProperty(prop.propertyId, 100, lastKey);
                const active = (result.tenants || []).filter(t => t.status === 'active' && t.email);
                allTenants = allTenants.concat(active);
                lastKey = result.lastEvaluatedKey || null;
            } while (lastKey);

            if (allTenants.length === 0) continue;

            for (const tenant of allTenants) {
                const sendRes = await notificationService.sendNotification({
                    type: 'BROADCAST',
                    ownerId: userId,
                    tenantId: tenant.tenantId,
                    tenantEmail: tenant.email,
                    replyTo: ownerEmail || undefined,
                    propertyId: prop.propertyId,
                    data: {
                        ownerName,
                        propertyName: prop.propertyName,
                        customSubject: subject,
                        message
                    }
                });

                if (sendRes.sent) {
                    totalSent++;
                } else {
                    totalFailed++;
                    console.warn(`[broadcastEmail] dispatch failed for ${tenant.email}: ${sendRes.reason}`);
                }
            }
        }

        return response.success({ sent: totalSent, failed: totalFailed, total: totalSent + totalFailed });

    } catch (err) {
        console.error('[broadcastEmail] Exception:', err);
        return response.error('Failed to send broadcast', 500);
    }
};
