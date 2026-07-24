const AWS = require('aws-sdk');
const response = require('../../utils/response');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const { code } = event.pathParameters || {};

        if (!code || code.trim().length === 0) {
            return response.error('Invite code is required', 400);
        }

        const sanitizedCode = code.trim().toUpperCase();

        // 1. Resolve invite code
        const inviteResult = await dynamodb.query({
            TableName: process.env.INVITE_CODE_TABLE,
            IndexName: 'CodeIndex',
            KeyConditionExpression: 'code = :c',
            ExpressionAttributeValues: { ':c': sanitizedCode },
        }).promise();

        if (!inviteResult.Items || inviteResult.Items.length === 0) {
            return response.error('Invalid or expired invitation link', 404);
        }

        const invite = inviteResult.Items[0];
        if (invite.status === 'revoked') {
            return response.error('This invitation link has been revoked', 410);
        }

        const propertyId = invite.propertyId;
        const result = await propertyService.getRoomsByProperty(propertyId);
        const rawRooms = result.rooms || [];

        // 2. Filter & format available rooms
        const roomsWithAvailableBeds = [];

        for (const r of rawRooms) {
            if (r.status === 'deleted' || r.status === 'maintenance') continue;

            const total = Number(r.totalBeds) || 1;
            const activeAssignments = await tenantService.getBedAssignmentsByRoom(r.roomId);

            // Bed assignments that are active or temporarily reserved (not expired/released)
            const now = new Date().toISOString();
            const busyBedNumbers = new Set();

            for (const assignment of activeAssignments) {
                if (['assigned'].includes(assignment.status)) {
                    busyBedNumbers.add(String(assignment.bedNumber).trim());
                } else if (assignment.status === 'reserved' && assignment.expiresAt && assignment.expiresAt > now) {
                    busyBedNumbers.add(String(assignment.bedNumber).trim());
                }
            }

            const beds = [];
            for (let i = 1; i <= total; i++) {
                const bedStr = String(i);
                const isOccupied = busyBedNumbers.has(bedStr);
                beds.push({
                    bedNumber: bedStr,
                    available: !isOccupied,
                    rent: Number(r.rentPerBed || r.rent || 0),
                });
            }

            const availableCount = beds.filter(b => b.available).length;

            if (availableCount > 0) {
                roomsWithAvailableBeds.push({
                    roomId: r.roomId,
                    roomNumber: r.roomNumber,
                    floor: r.floor ?? 0,
                    type: r.type || r.sharingType || 'Single',
                    genderType: r.genderType || r.roomGender || 'Co-live',
                    capacity: total,
                    occupiedBeds: total - availableCount,
                    availableBeds: availableCount,
                    rentPerBed: Number(r.rentPerBed || 0),
                    securityDeposit: Number(r.securityDeposit || 0),
                    amenities: r.amenities || [],
                    beds,
                });
            }
        }

        const sortedRooms = roomsWithAvailableBeds.sort((a, b) => {
            if (a.floor !== b.floor) return a.floor - b.floor;
            return (a.roomNumber || '').localeCompare(b.roomNumber || '', undefined, { numeric: true, sensitivity: 'base' });
        });

        return response.success({
            propertyId,
            propertyName: invite.propertyName,
            rooms: sortedRooms,
            totalAvailableRooms: sortedRooms.length,
        });

    } catch (err) {
        console.error('[getPublicAvailableRooms]', err);
        return response.error(err.message || 'Failed to fetch available rooms', 500);
    }
};
