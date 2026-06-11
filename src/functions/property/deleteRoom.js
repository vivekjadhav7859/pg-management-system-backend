
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
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
            return response.error('You can only delete rooms of your own properties', 403);
        }

        // Check if room has active tenants
        if (room.occupiedBeds > 0) {
            return response.error('Cannot delete room with active tenants', 400);
        }

        await propertyService.deleteRoom(roomId);

        // Update property total rooms and beds count
        await propertyService.updateProperty(property.propertyId, {
            totalRooms: Math.max(0, (property.totalRooms || 0) - 1),
            totalBeds: Math.max(0, (property.totalBeds || 0) - room.totalBeds),
            availableBeds: Math.max(0, (property.availableBeds || 0) - room.totalBeds)
        });

        return response.success({
            message: 'Room deleted successfully',
            roomId: roomId
        });

    } catch (err) {
        console.error('Delete room error:', err);
        return response.error('Failed to delete room', 500);
    }
};