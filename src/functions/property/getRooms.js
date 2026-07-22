
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
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
            return response.error('You can only view rooms of your own properties', 403);
        }

        const sanitizedRooms = (result.rooms || []).map(r => {
            const total = Number(r.totalBeds) || 1;
            const occ = r.occupiedBeds !== undefined ? Math.min(total, Math.max(0, Number(r.occupiedBeds))) : 0;
            const avail = Math.max(0, total - occ);
            let status = r.status;
            if (status !== 'maintenance' && status !== 'reserved') {
                status = avail === 0 ? 'occupied' : 'available';
            }
            return {
                ...r,
                totalBeds: total,
                occupiedBeds: occ,
                availableBeds: avail,
                status: status
            };
        });

        const sortedRooms = sanitizedRooms.sort((a, b) => {
            const floorA = a.floor ?? 0;
            const floorB = b.floor ?? 0;
            if (floorA !== floorB) return floorA - floorB;
            return (a.roomNumber || '').localeCompare(b.roomNumber || '', undefined, {
                numeric: true,
                sensitivity: 'base'
            });
        });

        return response.success({
            message: 'Rooms retrieved successfully',
            rooms: sortedRooms,
            count: sortedRooms.length,
            propertyId: propertyId
        });

    } catch (err) {
        console.error('Get rooms error:', err);
        return response.error('Failed to retrieve rooms', 500);
    }
};