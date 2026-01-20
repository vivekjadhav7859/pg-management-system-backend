const { verifyToken } = require('../../services/cognito.service');
const dynamoService = require('../../services/dynamodb.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const response = require('../../utils/response');
const { validateRequiredFields, sanitizeInput } = require('../../utils/validator');

exports.handler = async (event) => {
    try {
        console.log('Check-in tenant request received');

        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return response.error('Authorization header is required', 401);
        }

        const accessToken = authHeader.replace('Bearer ', '');
        const cognitoUser = await verifyToken(accessToken);
        const dbUser = await dynamoService.getUserByEmail(cognitoUser.email);

        if (!dbUser || dbUser.status !== 'active') {
            return response.error('User not found or not active', 403);
        }

        // Only owners and admins can check-in tenants
        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can check-in tenants', 403);
        }

        const body = JSON.parse(event.body);
        const { 
            userId, propertyId, roomId, bedNumber,
            name, email, phone, emergencyContact,
            checkInDate, rentAmount, securityDeposit,
            depositPaid, depositAmount, depositDate
        } = body;

        // Validate required fields
        const requiredValidation = validateRequiredFields(body, [
            'userId', 'propertyId', 'roomId', 'bedNumber',
            'name', 'email', 'phone', 'checkInDate',
            'rentAmount', 'securityDeposit'
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
            return response.error('You can only check-in tenants to your properties', 403);
        }

        // Verify room exists
        const room = await propertyService.getRoomById(roomId);
        if (!room) {
            return response.error('Room not found', 404);
        }

        if (room.propertyId !== propertyId) {
            return response.error('Room does not belong to this property', 400);
        }

        // Check if bed is available
        if (room.availableBeds <= 0) {
            return response.error('No beds available in this room', 400);
        }

        // Check if bed number is already assigned
        const existingAssignments = await tenantService.getBedAssignmentsByRoom(roomId);
        const bedTaken = existingAssignments.find(a => a.bedNumber === bedNumber);
        if (bedTaken) {
            return response.error(`Bed ${bedNumber} is already assigned`, 400);
        }

        // Check if user is already a tenant
        const existingTenant = await tenantService.getTenantByUserId(userId);
        if (existingTenant) {
            return response.error('User is already checked-in to a property', 400);
        }

        // Create tenant entry
        const tenant = await tenantService.createTenant({
            userId,
            propertyId,
            roomId,
            bedNumber,
            name: sanitizeInput(name),
            email: sanitizeInput(email),
            phone: sanitizeInput(phone),
            emergencyContact: emergencyContact || {},
            checkInDate,
            rentAmount,
            securityDeposit,
            depositPaid: depositPaid || false,
            depositAmount: depositAmount || 0,
            depositDate: depositDate || null
        });

        // Create bed assignment
        await tenantService.assignBed({
            tenantId: tenant.tenantId,
            propertyId,
            roomId,
            bedNumber,
            assignedDate: checkInDate
        });

        // Update room occupancy
        await propertyService.updateRoomOccupancy(roomId, 1);

        // Update property occupancy
        await propertyService.updatePropertyOccupancy(propertyId, 1);

        console.log('Tenant checked-in successfully:', tenant.tenantId);

        return response.success({
            message: 'Tenant checked-in successfully',
            tenant: {
                tenantId: tenant.tenantId,
                userId: tenant.userId,
                propertyId: tenant.propertyId,
                roomId: tenant.roomId,
                bedNumber: tenant.bedNumber,
                name: tenant.name,
                email: tenant.email,
                phone: tenant.phone,
                checkInDate: tenant.checkInDate,
                rentAmount: tenant.rentAmount,
                securityDeposit: tenant.securityDeposit,
                status: tenant.status,
                createdAt: tenant.createdAt
            }
        }, 201);

    } catch (err) {
        console.error('Check-in tenant error:', err);
        return response.error('Failed to check-in tenant', 500);
    }
};