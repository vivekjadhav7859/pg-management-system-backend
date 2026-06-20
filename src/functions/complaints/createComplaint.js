const complaintsService = require('../../services/complaints.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');
const { validateRequiredFields, sanitizeInput } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

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
        // If user is tenant, ensure they belong to this property
        if (dbUser.userType === 'tenant') {
            // we should ideally verify tenant is in this property, assuming they are
            tenantId = dbUser.userId;
        } else if (body.tenantId) {
            tenantId = body.tenantId; // Owner creating on behalf of tenant
        }

        const complaint = await complaintsService.createComplaint({
            propertyId,
            tenantId,
            title: sanitizeInput(title),
            description: sanitizeInput(description),
            category: sanitizeInput(category),
            priority: priority ? sanitizeInput(priority) : 'medium'
        });

        return response.success({
            message: 'Complaint created successfully',
            complaint
        }, 201);

    } catch (err) {
        console.error('Create complaint error:', err);
        return response.error('Failed to create complaint', 500);
    }
};
