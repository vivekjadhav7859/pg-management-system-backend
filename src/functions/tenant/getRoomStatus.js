
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
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

        // Verify property ownership
        const property = await propertyService.getPropertyById(room.propertyId);
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only view status of your property rooms', 403);
        }

        // Get active tenants in room
        const activeTenants = await tenantService.getActiveTenantsByRoom(roomId);
        
        // Get bed assignments
        const bedAssignments = await tenantService.getBedAssignmentsByRoom(roomId);

        return response.success({
            message: 'Room status retrieved successfully',
            room: {
                roomId: room.roomId,
                roomNumber: room.roomNumber,
                totalBeds: room.totalBeds,
                occupiedBeds: room.occupiedBeds,
                availableBeds: room.availableBeds,
                status: room.status
            },
            activeTenants: activeTenants,
            bedAssignments: bedAssignments,
            occupancyRate: ((room.occupiedBeds / room.totalBeds) * 100).toFixed(2) + '%'
        });

    } catch (err) {
        console.error('Get room status error:', err);
        return response.error('Failed to retrieve room status', 500);
    }
};