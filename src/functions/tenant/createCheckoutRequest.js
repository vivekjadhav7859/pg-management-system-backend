const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');
const { sanitizeInput } = require('../../utils/validator');
const { sendOwnerRequestEmail } = require('../../utils/ownerRequestEmail');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) return response.error('Unauthorized', 401);
        if (dbUser.userType !== 'tenant') {
            return response.error('Only active tenants can submit checkout requests', 403);
        }

        const body = JSON.parse(event.body || '{}');
        const { propertyId, plannedDate, reason, noticeGiven } = body;

        if (!propertyId) {
            return response.error('Property ID is required', 400);
        }

        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        const tenant = await tenantService.getTenantByUserId(dbUser.userId);
        if (!tenant || tenant.propertyId !== propertyId) {
            return response.error('You can only submit checkout requests for your linked property', 403);
        }

        const requestId = uuidv4();
        const timestamp = new Date().toISOString();

        const checkoutItem = {
            id: requestId,
            userIdIndex: property.ownerId,
            propertyId,
            tenantUserId: dbUser.userId,
            tenantId: tenant.tenantId,
            type: 'Check-out Request',
            entityType: 'checkoutRequest',
            requestStatus: 'pending',
            plannedDate: plannedDate ? sanitizeInput(plannedDate) : null,
            reason: reason ? sanitizeInput(reason) : 'Tenant initiated move-out checkout request',
            noticeGiven: Boolean(noticeGiven),
            tenantName: dbUser.name || tenant.name || '',
            tenantEmail: dbUser.email || tenant.email || '',
            tenantPhone: dbUser.phone || dbUser.phoneNumber || tenant.phone || '',
            read: false,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        const tenantCopy = {
            ...checkoutItem,
            id: uuidv4(),
            userIdIndex: dbUser.userId,
            title: 'Check-out Request Submitted',
            description: `Your check-out request for ${property.propertyName} (Planned Date: ${plannedDate || 'Flexible'}) has been sent to the owner.`,
        };

        if (process.env.NOTIFICATION_TABLE) {
            await Promise.all([
                dynamodb.put({ TableName: process.env.NOTIFICATION_TABLE, Item: checkoutItem }).promise(),
                dynamodb.put({ TableName: process.env.NOTIFICATION_TABLE, Item: tenantCopy }).promise(),
            ]);
        }

        if (property.ownerId) {
            const owner = await dynamoService.getUserById(property.ownerId).catch(() => null);
            if (owner?.email) {
                await sendOwnerRequestEmail({
                    owner,
                    tenant: {
                        userId: dbUser.userId,
                        name: dbUser.name || tenant.name,
                        email: dbUser.email || tenant.email,
                        phone: dbUser.phone || dbUser.phoneNumber || tenant.phone,
                    },
                    property,
                    requestTitle: 'Check-out Request',
                    requestType: 'checkout',
                    message: `Planned Date: ${plannedDate || 'Not specified'}\nReason: ${reason || 'No reason specified'}`,
                }).catch((emailErr) => {
                    console.warn('[createCheckoutRequest] Failed to email owner:', emailErr.message);
                });
            }
        }

        return response.success({
            message: 'Check-out request submitted successfully',
            checkoutRequest: checkoutItem,
        }, 201);
    } catch (err) {
        console.error('[createCheckoutRequest]', err);
        return response.error('Failed to submit check-out request', 500);
    }
};
