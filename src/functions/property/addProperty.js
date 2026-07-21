
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');
const { validateRequiredFields, sanitizeInput } = require('../../utils/validator');
const { normalizeImageKeys, withSignedImageUrls } = require('../../utils/propertyImages');
const { PROPERTY_TYPES, PROPERTY_CATEGORIES } = require('../../utils/constants');
const subscriptionService = require('../../services/subscription.service');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        console.log('Add property request received');

        // Verify token and get user info
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        // Check if user is owner
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can add properties', 403);
        }

        // Check if user account is active
        if (dbUser.status !== 'active') {
            return response.error('Account is not active', 403);
        }

        // Parse request body
        const body = JSON.parse(event.body);
        const { 
            propertyName, 
            address, 
            propertyType, 
            totalRooms, 
            totalBeds,
            amenities,
            rules,
            images,
            property_type,
            managementEnabled = true
        } = body;

        // Validate required fields
        const requiredValidation = validateRequiredFields(body, [
            'propertyName', 
            'address',
            'propertyType',
            'property_type'
        ]);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        // Validate address fields
        if (!address.street || !address.city || !address.state || !address.pincode) {
            return response.error('Complete address is required (street, city, state, pincode)', 400);
        }

        // Validate property type
        // Validate property type (category)
        const validCategories = Object.values(PROPERTY_CATEGORIES);
        if (!validCategories.includes(propertyType)) {
            return response.error(`Invalid property type (category). Must be one of: ${validCategories.join(', ')}`, 400);
        }

        // Validate new property_type
        const validTypes = Object.values(PROPERTY_TYPES);
        if (!validTypes.includes(property_type)) {
            return response.error(`Invalid property_type. Must be one of: ${validTypes.join(', ')}`, 400);
        }

        // A discovery-only listing is always free. A valid management activation
        // starts the account's one-time trial and enforces its property limit.
        if (managementEnabled !== false && dbUser.userType !== 'admin') {
            try {
                await subscriptionService.assertCanAddManagedProperty(dbUser.userId);
            } catch (error) {
                if (error instanceof subscriptionService.SubscriptionAccessError) {
                    return response.error(error.message, error.statusCode, error.details);
                }
                throw error;
            }
        }

        // Sanitize inputs
        const sanitizedPropertyName = sanitizeInput(propertyName);
        const sanitizedAddress = {
            street: sanitizeInput(address.street),
            city: sanitizeInput(address.city),
            state: sanitizeInput(address.state),
            pincode: sanitizeInput(address.pincode),
            country: address.country ? sanitizeInput(address.country) : 'India'
        };

        // Create property
        const property = await propertyService.createProperty({
            ownerId: dbUser.userId,
            propertyName: sanitizedPropertyName,
            address: sanitizedAddress,
            propertyType: propertyType,
            totalRooms: totalRooms || 0,
            totalBeds: totalBeds || 0,
            amenities: amenities || [],
            rules: rules || [],
            images: normalizeImageKeys(images || []),
            property_type: property_type,
            managementEnabled: managementEnabled !== false
        });

        console.log('Property created successfully:', property.propertyId);

        const signedProperty = withSignedImageUrls(property);

        return response.success({
            message: 'Property added successfully',
            property: {
                propertyId: signedProperty.propertyId,
                propertyName: signedProperty.propertyName,
                address: signedProperty.address,
                propertyType: signedProperty.propertyType,
                totalRooms: signedProperty.totalRooms,
                totalBeds: signedProperty.totalBeds,
                occupiedBeds: signedProperty.occupiedBeds,
                availableBeds: signedProperty.availableBeds,
                amenities: signedProperty.amenities,
                rules: signedProperty.rules,
                images: signedProperty.images,
                imageKeys: signedProperty.imageKeys,
                status: signedProperty.status,
                managementEnabled: signedProperty.managementEnabled,
                createdAt: signedProperty.createdAt,
                property_type: signedProperty.property_type
            }
        }, 201);

    } catch (err) {
        console.error('Add property error:', err);
        
        if (err.message && err.message.includes('expired')) {
            return response.error('Token expired', 401);
        }
        
        return response.error('Failed to add property', 500);
    }
};
