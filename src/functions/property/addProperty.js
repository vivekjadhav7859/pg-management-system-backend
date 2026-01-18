const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');
const { validateRequiredFields, sanitizeInput } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        console.log('Add property request received');

        // Verify token and get user info
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');
        const cognitoUser = await verifyToken(accessToken);

        // Get user details from database
        const dbUser = await dynamoService.getUserByEmail(cognitoUser.email);
        if (!dbUser) {
            return response.error('User not found', 404);
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
            images: images || []
        });

        console.log('Property created successfully:', property.propertyId);

        return response.success({
            message: 'Property added successfully',
            property: {
                propertyId: property.propertyId,
                propertyName: property.propertyName,
                address: property.address,
                propertyType: property.propertyType,
                totalRooms: property.totalRooms,
                totalBeds: property.totalBeds,
                occupiedBeds: property.occupiedBeds,
                availableBeds: property.availableBeds,
                amenities: property.amenities,
                rules: property.rules,
                images: property.images,
                status: property.status,
                createdAt: property.createdAt
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