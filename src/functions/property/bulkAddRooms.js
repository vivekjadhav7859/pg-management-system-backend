
const propertyService = require('../../services/property.service');
const response = require('../../utils/response');
const { sanitizeInput } = require('../../utils/validator');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');
const {
    validateNamingPattern,
    generateRoomNames
} = require('../../utils/roomNamingEngine');

const VALID_ROOM_TYPES = ['Single', 'Double', 'Triple', 'Dormitory'];
const MAX_BATCH_SIZE = 200;

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        console.log('Bulk add rooms request received');

        // ── Auth ──────────────────────────────────────────────────────────────
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can add rooms', 403);
        }

        if (dbUser.status !== 'active') {
            return response.error('Account is not active', 403);
        }

        // ── Parse path parameter ──────────────────────────────────────────────
        const propertyId = event.pathParameters?.propertyId;
        if (!propertyId) {
            return response.error('propertyId is required', 400);
        }

        // ── Parse body ────────────────────────────────────────────────────────
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch {
            return response.error('Invalid JSON body', 400);
        }

        const {
            floor,
            roomType,
            totalBeds,
            rentPerBed,
            securityDeposit,
            amenities,
            namingPattern,
            conflictStrategy = 'skip'  // 'skip' | 'abort'
        } = body;

        // ── Validate room fields ──────────────────────────────────────────────
        if (!roomType || !VALID_ROOM_TYPES.includes(roomType)) {
            return response.error(`Invalid roomType. Must be one of: ${VALID_ROOM_TYPES.join(', ')}`, 400);
        }

        const parsedFloor = Number(floor);
        if (!Number.isInteger(parsedFloor) || parsedFloor < 0 || parsedFloor > 50) {
            return response.error('floor must be an integer between 0 and 50', 400);
        }

        const parsedBeds = Number(totalBeds);
        if (!Number.isInteger(parsedBeds) || parsedBeds < 1 || parsedBeds > 20) {
            return response.error('totalBeds must be an integer between 1 and 20', 400);
        }

        const parsedRent = Number(rentPerBed);
        if (!isFinite(parsedRent) || parsedRent <= 0) {
            return response.error('rentPerBed must be a positive number', 400);
        }

        const parsedDeposit = Number(securityDeposit || 0);
        if (!isFinite(parsedDeposit) || parsedDeposit < 0) {
            return response.error('securityDeposit cannot be negative', 400);
        }

        const parsedAmenities = Array.isArray(amenities) ? amenities.map(a => sanitizeInput(String(a))) : [];

        // ── Validate naming pattern ───────────────────────────────────────────
        if (!namingPattern || typeof namingPattern !== 'object') {
            return response.error('namingPattern is required', 400);
        }

        const prefix = sanitizeInput(String(namingPattern.prefix ?? ''));
        const startNumber = Number(namingPattern.startNumber);
        const endNumber = Number(namingPattern.endNumber);
        const zeroPad = Boolean(namingPattern.zeroPad);

        const patternValidation = validateNamingPattern(prefix, startNumber, endNumber);
        if (!patternValidation.valid) {
            return response.error(patternValidation.error, 400);
        }

        const count = endNumber - startNumber + 1;
        if (count > MAX_BATCH_SIZE) {
            return response.error(`Batch size (${count}) exceeds maximum of ${MAX_BATCH_SIZE} rooms`, 400);
        }

        if (!['skip', 'abort'].includes(conflictStrategy)) {
            return response.error('conflictStrategy must be "skip" or "abort"', 400);
        }

        // ── Verify property ownership ─────────────────────────────────────────
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }

        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only add rooms to your own properties', 403);
        }

        // ── Subscription guard ────────────────────────────────────────────────
        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        // ── Generate room names ───────────────────────────────────────────────
        const generatedNames = generateRoomNames(prefix, startNumber, endNumber, zeroPad);

        // Check for internal duplicates in the generated list itself
        const nameSet = new Set(generatedNames);
        if (nameSet.size !== generatedNames.length) {
            return response.error('Naming pattern produced duplicate room names', 400);
        }

        // ── Conflict detection ────────────────────────────────────────────────
        const existingNumbers = await propertyService.getExistingRoomNumbers(propertyId);

        const conflicts = [];
        const cleanNames = [];

        for (const name of generatedNames) {
            if (existingNumbers.has(name)) {
                conflicts.push({ roomNumber: name, reason: 'Already exists' });
            } else {
                cleanNames.push(name);
            }
        }

        // If abort strategy and conflicts found — return immediately
        if (conflictStrategy === 'abort' && conflicts.length > 0) {
            return response.error(
                `${conflicts.length} room name(s) already exist in this property. Use conflictStrategy "skip" to create the rest.`,
                409,
                { conflicts }
            );
        }

        if (cleanNames.length === 0) {
            return response.success({
                message: 'All generated room names already exist. No rooms were created.',
                created: 0,
                skipped: conflicts.length,
                rooms: [],
                conflicts,
            });
        }

        // ── Build room objects for bulk insert ────────────────────────────────
        const roomsToCreate = cleanNames.map(name => ({
            roomNumber: name,
            roomType,
            floor: parsedFloor,
            totalBeds: parsedBeds,
            rentPerBed: parsedRent,
            securityDeposit: parsedDeposit,
            amenities: parsedAmenities
        }));

        // ── Bulk insert (transactional, chunked) ──────────────────────────────
        const { created, failed } = await propertyService.bulkCreateRooms(roomsToCreate, propertyId);

        // Merge any insert failures into the conflicts list for reporting
        const allSkipped = [
            ...conflicts,
            ...failed
        ];

        console.log(`Bulk room creation complete: ${created.length} created, ${allSkipped.length} skipped/failed`);

        // ── Build response ────────────────────────────────────────────────────
        const responseRooms = created.map(r => ({
            roomId: r.roomId,
            propertyId: r.propertyId,
            roomNumber: r.roomNumber,
            roomType: r.roomType,
            floor: r.floor,
            totalBeds: r.totalBeds,
            occupiedBeds: r.occupiedBeds,
            availableBeds: r.availableBeds,
            rentPerBed: r.rentPerBed,
            securityDeposit: r.securityDeposit,
            amenities: r.amenities,
            status: r.status,
            createdAt: r.createdAt
        }));

        return response.success({
            message: created.length === count
                ? `${created.length} rooms created successfully`
                : `${created.length} rooms created, ${allSkipped.length} skipped`,
            created: created.length,
            skipped: allSkipped.length,
            rooms: responseRooms,
            conflicts: allSkipped,
        }, 201);

    } catch (err) {
        console.error('Bulk add rooms error:', err);

        if (err.message && err.message.includes('expired')) {
            return response.error('Token expired', 401);
        }

        return response.error('Failed to create rooms in bulk. Please try again.', 500);
    }
};
