
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');
const { validateRequiredFields, sanitizeInput } = require('../../utils/validator');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        console.log('Add room request received');

        // Verify token and get user info
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        // Check if user is owner
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can add rooms', 403);
        }

        // Check if user account is active
        if (dbUser.status !== 'active') {
            return response.error('Account is not active', 403);
        }

        // Parse request body
        const body = JSON.parse(event.body);
        const { 
            propertyId,
            roomNumber, 
            roomType, 
            floor,
            totalBeds,
            rentPerBed,
            securityDeposit,
            amenities,
            images
        } = body;

        // Validate required fields
        const requiredValidation = validateRequiredFields(body, [
            'propertyId',
            'roomNumber', 
            'roomType',
            'totalBeds',
            'rentPerBed'
        ]);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        // Verify property exists and belongs to owner
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only add rooms to your own properties', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        // Validate room type
        const validRoomTypes = ['Single', 'Double', 'Triple', 'Dormitory'];
        if (!validRoomTypes.includes(roomType)) {
            return response.error(`Invalid room type. Must be one of: ${validRoomTypes.join(', ')}`, 400);
        }

        // Validate numeric values
        if (totalBeds < 1) {
            return response.error('Total beds must be at least 1', 400);
        }

        if (rentPerBed < 0) {
            return response.error('Rent per bed cannot be negative', 400);
        }

        // Sanitize inputs
        const sanitizedRoomNumber = sanitizeInput(roomNumber);

        // Create room
        const room = await propertyService.createRoom({
            propertyId: propertyId,
            roomNumber: sanitizedRoomNumber,
            roomType: roomType,
            floor: floor || 0,
            totalBeds: totalBeds,
            rentPerBed: rentPerBed,
            securityDeposit: securityDeposit || 0,
            amenities: amenities || [],
            images: images || []
        });

        // Update property total rooms and beds count
        const updatedProperty = await propertyService.updateProperty(propertyId, {
            totalRooms: (property.totalRooms || 0) + 1,
            totalBeds: (property.totalBeds || 0) + totalBeds,
            availableBeds: (property.availableBeds || 0) + totalBeds
        });

        console.log('Room created successfully:', room.roomId);

        return response.success({
            message: 'Room added successfully',
            room: {
                roomId: room.roomId,
                propertyId: room.propertyId,
                roomNumber: room.roomNumber,
                roomType: room.roomType,
                floor: room.floor,
                totalBeds: room.totalBeds,
                occupiedBeds: room.occupiedBeds,
                availableBeds: room.availableBeds,
                rentPerBed: room.rentPerBed,
                securityDeposit: room.securityDeposit,
                amenities: room.amenities,
                images: room.images,
                status: room.status,
                createdAt: room.createdAt
            },
            propertyUpdated: {
                totalRooms: updatedProperty.totalRooms,
                totalBeds: updatedProperty.totalBeds,
                availableBeds: updatedProperty.availableBeds
            }
        }, 201);

    } catch (err) {
        console.error('Add room error:', err);
        
        if (err.message && err.message.includes('expired')) {
            return response.error('Token expired', 401);
        }
        
        return response.error('Failed to add room', 500);
    }
};
