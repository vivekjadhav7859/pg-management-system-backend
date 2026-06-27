
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');
const { sanitizeInput } = require('../../utils/validator');
const { normalizeImageKeys, withSignedImageUrls } = require('../../utils/propertyImages');

exports.handler = async (event) => {
    try {
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        const propertyId = event.pathParameters.propertyId;
        const property = await propertyService.getPropertyById(propertyId);

        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only update your own properties', 403);
        }

        const body = JSON.parse(event.body);
        const updates = {};

        if (body.propertyName !== undefined) {
            updates.propertyName = sanitizeInput(body.propertyName);
        }

        if (body.address !== undefined) {
            updates.address = {
                street: sanitizeInput(body.address.street),
                city: sanitizeInput(body.address.city),
                state: sanitizeInput(body.address.state),
                pincode: sanitizeInput(body.address.pincode),
                country: body.address.country ? sanitizeInput(body.address.country) : 'India'
            };
        }

        if (body.propertyType !== undefined) {
            const validTypes = ['PG', 'Hostel', 'Apartment'];
            if (!validTypes.includes(body.propertyType)) {
                return response.error('Invalid property type', 400);
            }
            updates.propertyType = body.propertyType;
        }

        if (body.amenities !== undefined) {
            updates.amenities = body.amenities;
        }

        if (body.rules !== undefined) {
            updates.rules = body.rules;
        }

        if (body.images !== undefined) {
            updates.images = normalizeImageKeys(body.images);
        }

        if (body.status !== undefined) {
            const validStatuses = ['active', 'inactive', 'maintenance'];
            if (!validStatuses.includes(body.status)) {
                return response.error('Invalid status', 400);
            }
            updates.status = body.status;
        }

        if (Object.keys(updates).length === 0) {
            return response.error('No valid fields to update', 400);
        }

        const updatedProperty = await propertyService.updateProperty(propertyId, updates);

        return response.success({
            message: 'Property updated successfully',
            property: withSignedImageUrls(updatedProperty)
        });

    } catch (err) {
        console.error('Update property error:', err);
        return response.error('Failed to update property', 500);
    }
};
