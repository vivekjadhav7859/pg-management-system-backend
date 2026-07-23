const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const response = require('../../utils/response');
const dynamoService = require('../../services/dynamodb.service');
const cognitoService = require('../../services/cognito.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const notificationService = require('../../services/notification.service');
const { validateEmail, sanitizeInput } = require('../../utils/validator');
const { NOTIFICATION_EVENTS } = require('../../constants/notificationEvents');

const dynamodb = new AWS.DynamoDB.DocumentClient();

function bedAssignmentId(roomId, bedNumber) {
    return `reservation#${roomId}#${String(bedNumber).trim()}`;
}

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const { code } = event.pathParameters || {};
        if (!code) return response.error('Invite code is required', 400);

        const body = JSON.parse(event.body || '{}');
        const {
            name, email, phone, gender, dob, occupation, company,
            address, emergencyContact, stayDuration, kycDocuments,
            roomId, bedNumber
        } = body;

        if (!name || !email || !phone || !roomId || !bedNumber) {
            return response.error('Name, Email, Phone, Room, and Bed selection are required', 400);
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return response.error(emailValidation.message, 400);
        }

        const sanitizedEmail = email.toLowerCase().trim();
        const sanitizedName = sanitizeInput(name);
        const sanitizedPhone = sanitizeInput(phone);
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

        // Legacy code auto-heal: if expiresAt missing, default to 90 days from now
        if (!invite.expiresAt) {
            const NinetyDaysMs = 90 * 24 * 60 * 60 * 1000;
            const newExpiry = new Date(Date.now() + NinetyDaysMs).toISOString();
            invite.expiresAt = newExpiry;
            dynamodb.update({
                TableName: process.env.INVITE_CODE_TABLE,
                Key: { propertyId: invite.propertyId },
                UpdateExpression: 'SET expiresAt = :exp, status = :st, updatedAt = :ts',
                ExpressionAttributeValues: {
                    ':exp': newExpiry,
                    ':st': 'active',
                    ':ts': new Date().toISOString(),
                },
            }).promise().catch((e) => console.warn('[submitPublicJoinRequest] legacy code update warning:', e.message));
        }

        if (invite.expiresAt && new Date() > new Date(invite.expiresAt)) {
            const { notifyOwnerLinkExpired } = require('../../utils/expiredLinkAlert');
            await notifyOwnerLinkExpired({
                ownerId: invite.ownerId,
                propertyId: invite.propertyId,
                propertyName: invite.propertyName,
                code: invite.code,
                linkType: 'property_invite',
            });
            return response.error('This invitation link has expired after 3 months. The owner has been notified.', 410);
        }

        const propertyId = invite.propertyId;

        // 2. Fetch Property and Room
        const [property, room] = await Promise.all([
            propertyService.getPropertyById(propertyId),
            propertyService.getRoomById(roomId)
        ]);

        if (!property) return response.error('Property not found', 404);
        if (!room || room.propertyId !== propertyId) return response.error('Selected room is invalid', 400);

        // 3. User account check or creation
        let existingUser = await dynamoService.getUserByEmail(sanitizedEmail);
        let tenantUserId;
        let isNewUser = false;

        if (existingUser) {
            tenantUserId = existingUser.userId;
        } else {
            isNewUser = true;
            tenantUserId = uuidv4();
            const timestamp = new Date().toISOString();

            try {
                await cognitoService.createInvitedUser(sanitizedEmail, {
                    name: sanitizedName,
                    phone_number: sanitizedPhone
                });
            } catch (cogErr) {
                if (cogErr.code !== 'UsernameExistsException') {
                    console.warn('[submitPublicJoinRequest] Cognito user creation warning:', cogErr.message);
                }
            }

            const newUserItem = {
                userId: tenantUserId,
                cognitoUserId: tenantUserId,
                email: sanitizedEmail,
                name: sanitizedName,
                phoneNumber: sanitizedPhone,
                userType: 'tenant',
                status: 'pending_activation',
                emailVerified: false,
                profileCompleted: true,
                createdAt: timestamp,
                updatedAt: timestamp,
                emailLowerCase: sanitizedEmail,
                userTypeIndex: 'tenant',
            };

            await dynamodb.put({
                TableName: process.env.USER_TABLE,
                Item: newUserItem,
                ConditionExpression: 'attribute_not_exists(userId)'
            }).promise();
        }

        // 4. Conflict Detection
        const conflictFlags = [];

        // Check active tenancy for this user
        const activeTenant = await tenantService.getTenantByUserId(tenantUserId);
        if (activeTenant && ['active', 'in_progress'].includes(activeTenant.status)) {
            conflictFlags.push(`DUPLICATE_ACTIVE_TENANT: User is already checked-in to ${activeTenant.propertyId}`);
        }

        // Check if bed is already assigned
        const activeAssignments = await tenantService.getBedAssignmentsByRoom(roomId);
        const bedTaken = activeAssignments.find(a => String(a.bedNumber).trim() === String(bedNumber).trim() && a.status === 'assigned');
        if (bedTaken) {
            conflictFlags.push(`BED_TAKEN: Bed ${bedNumber} is currently assigned to another active tenant`);
        }

        // Check phone duplicate
        const phoneMatch = await dynamodb.scan({
            TableName: process.env.TENANT_TABLE,
            FilterExpression: 'phone = :p AND #status IN (:a, :i)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':p': sanitizedPhone, ':a': 'active', ':i': 'in_progress' },
            Limit: 5
        }).promise();
        if (phoneMatch.Items && phoneMatch.Items.length > 0) {
            conflictFlags.push(`DUPLICATE_PHONE: Phone number ${sanitizedPhone} is registered to another active tenant`);
        }

        // 5. Reserve Bed Temporarily (30 min expiry window)
        const timestamp = new Date().toISOString();
        const expiryTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const assignmentId = bedAssignmentId(roomId, bedNumber);

        try {
            await dynamodb.put({
                TableName: process.env.BED_ASSIGNMENT_TABLE,
                Item: {
                    assignmentId,
                    tenantId: tenantUserId,
                    propertyId,
                    roomId,
                    bedNumber: String(bedNumber).trim(),
                    status: 'reserved',
                    reservedByRequestId: `joinreq#${tenantUserId}`,
                    expiresAt: expiryTime,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    roomIdIndex: roomId,
                    tenantIdIndex: tenantUserId
                }
            }).promise();
        } catch (reserveErr) {
            console.warn('[submitPublicJoinRequest] Temporary bed reservation non-blocking error:', reserveErr.message);
        }

        // 6. Create Owner Join Request Item & Tenant Copy in NOTIFICATION_TABLE
        const requestId = uuidv4();
        const title = 'Tenant Join Request';
        const description = `${sanitizedName} (${sanitizedPhone}) submitted a self-service join request for Room ${room.roomNumber}, Bed ${bedNumber}.`;

        const ownerRequest = {
            id: requestId,
            userIdIndex: property.ownerId,
            propertyIdIndex: propertyId,
            propertyName: property.propertyName,
            type: title,
            title,
            description,
            entityId: requestId,
            entityType: 'tenantJoinRequest',
            read: false,
            requestStatus: 'pending',
            requestType: 'tenant_join',
            tenantUserId,
            tenantName: sanitizedName,
            tenantEmail: sanitizedEmail,
            tenantPhone: sanitizedPhone,
            gender: gender || 'Unspecified',
            dob: dob || null,
            occupation: occupation || null,
            company: company || null,
            address: address || null,
            emergencyContact: emergencyContact || {},
            stayDuration: stayDuration || null,
            kycDocuments: kycDocuments || {},
            roomId,
            roomNumber: room.roomNumber,
            bedNumber: String(bedNumber).trim(),
            reservationAssignmentId: assignmentId,
            conflictFlags,
            source: 'self_service_qr',
            createdAt: timestamp,
            createdAtIndex: timestamp,
        };

        const tenantCopy = {
            ...ownerRequest,
            id: uuidv4(),
            userIdIndex: tenantUserId,
            title: 'Join Request Sent',
            description: `Your join request for ${property.propertyName} (Room ${room.roomNumber}, Bed ${bedNumber}) has been submitted to the owner for review.`,
            read: false,
        };

        await Promise.all([
            dynamodb.put({ TableName: process.env.NOTIFICATION_TABLE, Item: ownerRequest }).promise(),
            dynamodb.put({ TableName: process.env.NOTIFICATION_TABLE, Item: tenantCopy }).promise(),
        ]);

        // 7. Dispatch Owner Notification
        try {
            await notificationService.sendNotification({
                type: NOTIFICATION_EVENTS.TENANT_INVITATION,
                ownerId: property.ownerId,
                tenantId: tenantUserId,
                tenantEmail: sanitizedEmail,
                propertyId,
                data: {
                    tenantName: sanitizedName,
                    propertyName: property.propertyName,
                    roomNumber: room.roomNumber,
                    bedNumber,
                    rentAmount: Number(room.rentPerBed || 0),
                },
                idempotencyKey: `JOIN_REQ#${requestId}`
            });
        } catch (notifErr) {
            console.warn('[submitPublicJoinRequest] Notification dispatch notice:', notifErr.message);
        }

        return response.success({
            message: 'Join request submitted successfully. The property owner has been notified.',
            requestId,
            status: 'pending',
            propertyName: property.propertyName,
            roomNumber: room.roomNumber,
            bedNumber: String(bedNumber).trim(),
            hasConflicts: conflictFlags.length > 0,
            conflictFlags,
            isNewUser,
        }, 201);

    } catch (err) {
        console.error('[submitPublicJoinRequest]', err);
        return response.error(err.message || 'Failed to submit join request', 500);
    }
};
