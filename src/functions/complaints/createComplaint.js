const complaintsService = require('../../services/complaints.service');
const notificationService = require('../../services/notification.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const dynamoService = require('../../services/dynamodb.service');
const response = require('../../utils/response');
const { validateRequiredFields, sanitizeInput } = require('../../utils/validator');
const { sendOwnerRequestEmail } = require('../../utils/ownerRequestEmail');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        // Tenant complaints remain available; owner-created management records
        // follow the SaaS write-access state.
        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        const body = JSON.parse(event.body);
        const { propertyId } = event.pathParameters;
        const { title, description, category, priority } = body;

        const requiredValidation = validateRequiredFields(body, ['title', 'description', 'category']);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        // Verify property exists
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        let tenantId = null;
        if (dbUser.userType === 'tenant') {
            const tenant = await tenantService.getTenantByUserId(dbUser.userId);
            if (!tenant || tenant.propertyId !== propertyId) {
                return response.error('You can only raise complaints for your linked property', 403);
            }
            tenantId = tenant.tenantId;
        } else if (dbUser.userType === 'owner') {
            if (property.ownerId !== dbUser.userId) {
                return response.error('You can only create complaints for your own properties', 403);
            }
            tenantId = body.tenantId || null;
        } else if (body.tenantId) {
            tenantId = body.tenantId;
        } 

        const complaint = await complaintsService.createComplaint({
            propertyId,
            tenantId,
            title: sanitizeInput(title),
            description: sanitizeInput(description),
            category: sanitizeInput(category),
            priority: priority ? sanitizeInput(priority) : 'medium'
        });

        if (dbUser.userType === 'tenant' && property.ownerId) {
            const notificationType = category === 'checkout' ? 'Check-out Request' : 'Complaint Raised';
            await notificationService.createNotification(
                property.ownerId,
                propertyId,
                notificationType,
                sanitizeInput(title),
                sanitizeInput(description),
                complaint.complaintId,
                'complaint',
                {
                    requestStatus: 'pending',
                    tenantUserId: dbUser.userId,
                    tenantName: dbUser.name || '',
                    tenantEmail: dbUser.email || '',
                    tenantPhone: dbUser.phone || dbUser.phoneNumber || '',
                    requestType: category === 'checkout' ? 'checkout' : 'complaint',
                }
            ).catch((notificationErr) => {
                console.warn('Non-critical: failed to notify owner about complaint', notificationErr.message);
            });

            const owner = await dynamoService.getUserById(property.ownerId).catch((ownerErr) => {
                console.warn('Non-critical: failed to load owner for complaint email', ownerErr.message);
                return null;
            });

            if (owner?.email) {
                await sendOwnerRequestEmail({
                    owner,
                    tenant: {
                        userId: dbUser.userId,
                        name: dbUser.name,
                        email: dbUser.email,
                        phone: dbUser.phone || dbUser.phoneNumber,
                    },
                    property,
                    requestTitle: notificationType,
                    requestType: category === 'checkout' ? 'checkout' : 'complaint',
                    message: `${sanitizeInput(title)}\n\n${sanitizeInput(description)}`,
                }).catch((emailErr) => {
                    console.warn('Non-critical: failed to email owner about complaint', emailErr.message);
                });
            }
        }

        return response.success({
            message: 'Complaint created successfully',
            complaint
        }, 201);

    } catch (err) {
        console.error('Create complaint error:', err);
        return response.error('Failed to create complaint', 500);
    }
};
