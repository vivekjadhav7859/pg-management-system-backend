const AWS = require('aws-sdk');
const response = require('../../utils/response');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const PROPERTY_TABLE = process.env.PROPERTY_TABLE;
const ROOM_TABLE = process.env.ROOM_TABLE;

exports.handler = async (event) => {
    try {
        const query = event.queryStringParameters || {};
        const city = (query.city || '').trim().toLowerCase();
        const search = (query.search || '').trim().toLowerCase();
        const minRent = query.minRent ? Number(query.minRent) : null;
        const maxRent = query.maxRent ? Number(query.maxRent) : null;
        const amenities = (query.amenities || '')
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean);

        const propResult = await dynamodb.scan({
            TableName: PROPERTY_TABLE,
            FilterExpression: '#status = :active',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':active': 'active' },
        }).promise();

        const properties = await Promise.all((propResult.Items || []).map(async (property) => {
            const roomsResult = await dynamodb.query({
                TableName: ROOM_TABLE,
                IndexName: 'PropertyIdIndex',
                KeyConditionExpression: 'propertyIdIndex = :propertyId',
                ExpressionAttributeValues: { ':propertyId': property.propertyId },
            }).promise();

            const rooms = (roomsResult.Items || []).filter((room) => room.status !== 'deleted');
            const availableRooms = rooms.filter((room) => (room.availableBeds || 0) > 0 && room.status !== 'maintenance');
            const rents = rooms.map((room) => Number(room.rentPerBed || 0)).filter((rent) => rent > 0);
            const lowestRent = rents.length ? Math.min(...rents) : 0;
            const highestRent = rents.length ? Math.max(...rents) : 0;

            return {
                propertyId: property.propertyId,
                propertyName: property.propertyName,
                address: property.address,
                propertyType: property.propertyType,
                amenities: property.amenities || [],
                rules: property.rules || [],
                images: property.images || [],
                totalRooms: rooms.length,
                totalBeds: rooms.reduce((sum, room) => sum + Number(room.totalBeds || 0), 0),
                availableBeds: availableRooms.reduce((sum, room) => sum + Number(room.availableBeds || 0), 0),
                lowestRent,
                highestRent,
                rooms: availableRooms.map((room) => ({
                    roomId: room.roomId,
                    roomNumber: room.roomNumber,
                    roomType: room.roomType,
                    floor: room.floor,
                    totalBeds: room.totalBeds,
                    availableBeds: room.availableBeds,
                    rentPerBed: room.rentPerBed,
                    securityDeposit: room.securityDeposit,
                    amenities: room.amenities || [],
                })),
            };
        }));

        const filtered = properties.filter((property) => {
            const haystack = [
                property.propertyName,
                property.address?.street,
                property.address?.city,
                property.address?.state,
                property.propertyType,
                ...(property.amenities || []),
            ].filter(Boolean).join(' ').toLowerCase();

            const propertyCity = (property.address?.city || '').toLowerCase();
            const amenitySet = new Set((property.amenities || []).map((item) => String(item).toLowerCase()));

            if (city && !propertyCity.includes(city)) return false;
            if (search && !haystack.includes(search)) return false;
            if (minRent !== null && property.highestRent && property.highestRent < minRent) return false;
            if (maxRent !== null && property.lowestRent && property.lowestRent > maxRent) return false;
            if (amenities.length && !amenities.every((item) => amenitySet.has(item))) return false;
            return true;
        });

        return response.success({
            properties: filtered,
            count: filtered.length,
        });
    } catch (err) {
        console.error('[discoverProperties]', err);
        return response.error('Failed to discover PGs', 500);
    }
};
