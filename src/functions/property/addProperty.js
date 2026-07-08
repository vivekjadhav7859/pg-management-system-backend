
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');
const { validateRequiredFields, sanitizeInput } = require('../../utils/validator');
const { normalizeImageKeys, withSignedImageUrls } = require('../../utils/propertyImages');

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
            images
        } = body;

        // Validate required fields
        const requiredValidation = validateRequiredFields(body, [
            'propertyName', 
            'address',
            'propertyType'
        ]);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        // Validate address fields
        if (!address.street || !address.city || !address.state || !address.pincode) {
            return response.error('Complete address is required (street, city, state, pincode)', 400);
        }

        // Validate property type
        const validPropertyTypes = ['PG', 'Hostel', 'Apartment'];
        if (!validPropertyTypes.includes(propertyType)) {
            return response.error(`Invalid property type. Must be one of: ${validPropertyTypes.join(', ')}`, 400);
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
            images: normalizeImageKeys(images || [])
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
                createdAt: signedProperty.createdAt
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
