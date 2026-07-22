const complaintsService = require('../../services/complaints.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        const { propertyId } = event.pathParameters;

        // Verify property access
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (dbUser.userType === 'owner' && property.ownerId !== dbUser.userId) {
            return response.error('Unauthorized to view these complaints', 403);
        }

        const complaints = await complaintsService.getComplaintsByProperty(propertyId);

        // If user is tenant, only show their own complaints
        let filteredComplaints = complaints;
        if (dbUser.userType === 'tenant') {
            const tenant = await tenantService.getTenantByUserId(dbUser.userId);
            if (!tenant || tenant.propertyId !== propertyId) {
                return response.error('Unauthorized to view these complaints', 403);
            }
            filteredComplaints = complaints.filter(c => c.tenantIdIndex === tenant.tenantId);
        }

        // Enrich complaints with roomNumber and tenantName
        const [roomsRes, tenantsRes] = await Promise.all([
            propertyService.getRoomsByProperty(propertyId).catch(() => ({ rooms: [] })),
            tenantService.getTenantsByProperty(propertyId).catch(() => ({ tenants: [] }))
        ]);
        const roomMap = new Map((roomsRes.rooms || []).map(r => [r.roomId, r.roomNumber]));
        const tenantMap = new Map((tenantsRes.tenants || []).map(t => [t.tenantId, t]));

        const enrichedComplaints = filteredComplaints.map(c => {
            const tenantObj = tenantMap.get(c.tenantIdIndex || c.tenantId);
            const resolvedRoomId = c.roomId || tenantObj?.roomId;
            const resolvedRoomNumber = c.roomNumber || roomMap.get(resolvedRoomId) || tenantObj?.roomNumber || null;
            const resolvedTenantName = c.tenantName || tenantObj?.name || null;
            return {
                ...c,
                roomId: resolvedRoomId || c.roomId,
                roomNumber: resolvedRoomNumber,
                tenantName: resolvedTenantName
            };
        });

        return response.success({
            complaints: enrichedComplaints
        });

    } catch (err) {
        console.error('Get complaints error:', err);
        return response.error('Failed to get complaints', 500);
    }
};
