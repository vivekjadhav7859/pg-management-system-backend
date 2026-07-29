
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');
const { sanitizeInput } = require('../../utils/validator');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        const roomId = event.pathParameters.roomId;
        const room = await propertyService.getRoomById(roomId);

        if (!room) {
            return response.error('Room not found', 404);
        }

        const property = await propertyService.getPropertyById(room.propertyId);
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only update rooms of your own properties', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        const body = JSON.parse(event.body);
        const updates = {};

        if (body.roomNumber !== undefined) {
            const newRoomNumber = sanitizeInput(body.roomNumber);
            if (newRoomNumber !== room.roomNumber) {
                const roomsData = await propertyService.getRoomsByProperty(room.propertyId, 500);
                const isDuplicate = (roomsData.rooms || []).some(
                    r => (r.roomId || r.id) !== roomId && 
                         String(r.roomNumber || '').trim().toLowerCase() === newRoomNumber.trim().toLowerCase() && 
                         r.status !== 'deleted'
                );
                if (isDuplicate) {
                    return response.error(`Room number "${newRoomNumber}" already exists in this property`, 400);
                }
            }
            updates.roomNumber = newRoomNumber;
        }

        if (body.roomType !== undefined) {
            const validTypes = ['Single', 'Double', 'Triple', 'Dormitory'];
            if (!validTypes.includes(body.roomType)) {
                return response.error('Invalid room type', 400);
            }
            updates.roomType = body.roomType;
        }

        if (body.floor !== undefined) {
            updates.floor = body.floor;
        }

        if (body.rentPerBed !== undefined) {
            if (body.rentPerBed < 0) {
                return response.error('Rent cannot be negative', 400);
            }
            updates.rentPerBed = body.rentPerBed;
        }

        if (body.securityDeposit !== undefined) {
            if (body.securityDeposit < 0) {
                return response.error('Security deposit cannot be negative', 400);
            }
            updates.securityDeposit = body.securityDeposit;
        }

        if (body.amenities !== undefined) {
            updates.amenities = body.amenities;
        }

        if (body.images !== undefined) {
            updates.images = body.images;
        }

        if (body.status !== undefined) {
            const validStatuses = ['available', 'occupied', 'maintenance'];
            if (!validStatuses.includes(body.status)) {
                return response.error('Invalid status', 400);
            }
            updates.status = body.status;
        }

        if (Object.keys(updates).length === 0) {
            return response.error('No valid fields to update', 400);
        }

        const updatedRoom = await propertyService.updateRoom(roomId, updates);

        return response.success({
            message: 'Room updated successfully',
            room: updatedRoom
        });

    } catch (err) {
        console.error('Update room error:', err);
        return response.error('Failed to update room', 500);
    }
};
