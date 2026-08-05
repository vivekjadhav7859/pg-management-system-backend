const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamoService = require('../../services/dynamodb.service');
const cognitoService = require('../../services/cognito.service');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const notificationService = require('../../services/notification.service');
const { NOTIFICATION_EVENTS } = require('../../constants/notificationEvents');
const response = require('../../utils/response');
const { validateRequiredFields, validateEmail, sanitizeInput } = require('../../utils/validator');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');
const { generateInvitationToken, hashToken } = require('../../utils/crypto');

const dynamodb = new AWS.DynamoDB.DocumentClient();

function bedAssignmentId(roomId, bedNumber) {
    return `reservation#${roomId}#${String(bedNumber).trim()}`;
}

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        console.log('Invite/Check-in tenant request received');

        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can invite tenants', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        const body = JSON.parse(event.body || '{}');
        const {
            propertyId, roomId, bedNumber,
            name, email, phone, emergencyContact,
            checkInDate, rentAmount, securityDeposit,
            depositPaid, depositAmount, depositDate
        } = body;

        const requiredValidation = validateRequiredFields(body, [
            'propertyId', 'roomId', 'bedNumber',
            'name', 'email', 'phone', 'checkInDate',
            'rentAmount', 'securityDeposit'
        ]);
        if (!requiredValidation.valid) {
            return response.error(requiredValidation.message, 400);
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return response.error(emailValidation.message, 400);
        }

        const sanitizedEmail = email.toLowerCase().trim();
        const sanitizedName = sanitizeInput(name);
        const sanitizedPhone = sanitizeInput(phone);

        // Verify property exists & belongs to owner
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only add tenants to your own properties', 403);
        }

        // Verify room exists
        const room = await propertyService.getRoomById(roomId);
        if (!room) {
            return response.error('Room not found', 404);
        }
        if (room.propertyId !== propertyId) {
            return response.error('Room does not belong to this property', 400);
        }

        if (room.availableBeds <= 0) {
            return response.error('No beds available in this room', 400);
        }

        // Check if bed number is taken
        const existingAssignments = await tenantService.getBedAssignmentsByRoom(roomId);
        const bedTaken = existingAssignments.find(a => String(a.bedNumber).trim() === String(bedNumber).trim());
        if (bedTaken) {
            return response.error(`Bed ${bedNumber} is already assigned`, 400);
        }

        const timestamp = new Date().toISOString();
        const tenantId = uuidv4();
        const assignmentId = bedAssignmentId(roomId, bedNumber);

        // Check if user account already exists in DynamoDB
        let existingUser = await dynamoService.getUserByEmail(sanitizedEmail);
        let targetUserId;
        let isNewUser = false;
        let rawToken = null;
        let tokenHash = null;
        let tokenExpiry = null;

        if (existingUser) {
            targetUserId = existingUser.userId;
            // Verify if already checked in as tenant
            const activeTenant = await tenantService.getTenantByUserId(targetUserId);
            if (activeTenant) {
                return response.error('User is already checked-in to an active property', 400);
            }
        } else {
            isNewUser = true;
            targetUserId = uuidv4();

            // Create user in Cognito (unconfirmed, suppressed welcome email)
            let cognitoUser;
            try {
                cognitoUser = await cognitoService.createInvitedUser(sanitizedEmail, {
                    name: sanitizedName,
                    phone_number: sanitizedPhone
                });
            } catch (cogErr) {
                if (cogErr.code === 'UsernameExistsException') {
                    // Fallback to fetch existing Cognito user if out of sync
                    const fetchedDetails = await cognitoService.getUserDetails(sanitizedEmail);
                    cognitoUser = { userId: fetchedDetails.userId };
                } else {
                    throw cogErr;
                }
            }

            // Generate secure 256-bit invitation token & SHA-256 hash
            rawToken = generateInvitationToken();
            tokenHash = hashToken(rawToken);
            // 90 days (3 months) expiration
            tokenExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        }

        const tenantItem = {
            tenantId,
            userId: targetUserId,
            propertyId,
            roomId,
            roomNumber: room.roomNumber,
            bedNumber,
            name: sanitizedName,
            email: sanitizedEmail,
            phone: sanitizedPhone,
            emergencyContact: emergencyContact || {},
            kycDocuments: {},
            kycStatus: 'pending',
            checkInDate,
            checkOutDate: null,
            rentAmount: Number(rentAmount),
            securityDeposit: Number(securityDeposit),
            depositPaid: Boolean(depositPaid),
            depositAmount: depositPaid ? Number(depositAmount || 0) : 0,
            depositDate: depositPaid ? (depositDate || timestamp) : null,
            status: 'in_progress',
            tenancyStatus: 'onboarding',
            onboardingStatus: isNewUser ? 'pending_activation' : 'activated',
            createdAt: timestamp,
            updatedAt: timestamp,
            propertyIdIndex: propertyId,
            roomIdIndex: roomId,
            userIdIndex: targetUserId,
            statusIndex: 'in_progress'
        };

        const assignmentItem = {
            assignmentId,
            tenantId,
            propertyId,
            roomId,
            bedNumber,
            assignedDate: checkInDate || timestamp,
            releasedDate: null,
            status: 'assigned',
            createdAt: timestamp,
            updatedAt: timestamp,
            roomIdIndex: roomId,
            tenantIdIndex: tenantId
        };

        if (isNewUser) {
            // Write User + Tenant + BedAssignment + Room/Property Occupancy atomically
            const newUserItem = {
                userId: targetUserId,
                cognitoUserId: targetUserId,
                email: sanitizedEmail,
                name: sanitizedName,
                phoneNumber: sanitizedPhone,
                userType: 'tenant',
                status: 'pending_activation',
                emailVerified: false,
                profileCompleted: false,
                createdAt: timestamp,
                updatedAt: timestamp,
                emailLowerCase: sanitizedEmail,
                userTypeIndex: 'tenant',
                invitationTokenHash: tokenHash,
                invitationExpiresAt: tokenExpiry,
                invitationStatus: 'sent',
                invitationSentAt: timestamp,
                invitationResentCount: 0
            };

            await dynamodb.transactWrite({
                TransactItems: [
                    {
                        Put: {
                            TableName: process.env.USER_TABLE,
                            Item: newUserItem,
                            ConditionExpression: 'attribute_not_exists(userId)'
                        }
                    },
                    {
                        Put: {
                            TableName: process.env.TENANT_TABLE,
                            Item: tenantItem,
                            ConditionExpression: 'attribute_not_exists(tenantId)'
                        }
                    },
                    {
                        Update: {
                            TableName: process.env.BED_ASSIGNMENT_TABLE,
                            Key: { assignmentId },
                            UpdateExpression: [
                                'SET tenantId = :tenantId',
                                'propertyId = :propertyId',
                                'roomId = :roomId',
                                'bedNumber = :bedNumber',
                                'assignedDate = :assignedDate',
                                'releasedDate = :releasedDate',
                                '#status = :assigned',
                                'createdAt = if_not_exists(createdAt, :createdAt)',
                                'updatedAt = :updatedAt',
                                'roomIdIndex = :roomId',
                                'tenantIdIndex = :tenantId'
                            ].join(', '),
                            ExpressionAttributeNames: { '#status': 'status' },
                            ExpressionAttributeValues: {
                                ':tenantId': assignmentItem.tenantId,
                                ':propertyId': assignmentItem.propertyId,
                                ':roomId': assignmentItem.roomId,
                                ':bedNumber': assignmentItem.bedNumber,
                                ':assignedDate': assignmentItem.assignedDate,
                                ':releasedDate': null,
                                ':assigned': 'assigned',
                                ':released': 'released',
                                ':expired': 'expired',
                                ':cancelled': 'cancelled',
                                ':createdAt': timestamp,
                                ':updatedAt': timestamp
                            },
                            ConditionExpression: 'attribute_not_exists(assignmentId) OR #status IN (:released, :expired, :cancelled)'
                        }
                    },
                    {
                        Update: {
                            TableName: process.env.ROOM_TABLE,
                            Key: { roomId },
                            UpdateExpression: 'SET occupiedBeds = occupiedBeds + :one, availableBeds = availableBeds - :one, updatedAt = :ts',
                            ExpressionAttributeValues: { ':one': 1, ':ts': timestamp, ':zero': 0 },
                            ConditionExpression: 'availableBeds > :zero'
                        }
                    },
                    {
                        Update: {
                            TableName: process.env.PROPERTY_TABLE,
                            Key: { propertyId },
                            UpdateExpression: 'SET occupiedBeds = occupiedBeds + :one, availableBeds = availableBeds - :one, updatedAt = :ts',
                            ExpressionAttributeValues: { ':one': 1, ':ts': timestamp }
                        }
                    }
                ]
            }).promise();
        } else {
            // Existing user: create tenant record and assign bed
            await dynamodb.transactWrite({
                TransactItems: [
                    {
                        Put: {
                            TableName: process.env.TENANT_TABLE,
                            Item: tenantItem,
                            ConditionExpression: 'attribute_not_exists(tenantId)'
                        }
                    },
                    {
                        Update: {
                            TableName: process.env.BED_ASSIGNMENT_TABLE,
                            Key: { assignmentId },
                            UpdateExpression: [
                                'SET tenantId = :tenantId',
                                'propertyId = :propertyId',
                                'roomId = :roomId',
                                'bedNumber = :bedNumber',
                                'assignedDate = :assignedDate',
                                'releasedDate = :releasedDate',
                                '#status = :assigned',
                                'createdAt = if_not_exists(createdAt, :createdAt)',
                                'updatedAt = :updatedAt',
                                'roomIdIndex = :roomId',
                                'tenantIdIndex = :tenantId'
                            ].join(', '),
                            ExpressionAttributeNames: { '#status': 'status' },
                            ExpressionAttributeValues: {
                                ':tenantId': assignmentItem.tenantId,
                                ':propertyId': assignmentItem.propertyId,
                                ':roomId': assignmentItem.roomId,
                                ':bedNumber': assignmentItem.bedNumber,
                                ':assignedDate': assignmentItem.assignedDate,
                                ':releasedDate': null,
                                ':assigned': 'assigned',
                                ':released': 'released',
                                ':expired': 'expired',
                                ':cancelled': 'cancelled',
                                ':createdAt': timestamp,
                                ':updatedAt': timestamp
                            },
                            ConditionExpression: 'attribute_not_exists(assignmentId) OR #status IN (:released, :expired, :cancelled)'
                        }
                    },
                    {
                        Update: {
                            TableName: process.env.ROOM_TABLE,
                            Key: { roomId },
                            UpdateExpression: 'SET occupiedBeds = occupiedBeds + :one, availableBeds = availableBeds - :one, updatedAt = :ts',
                            ExpressionAttributeValues: { ':one': 1, ':ts': timestamp, ':zero': 0 },
                            ConditionExpression: 'availableBeds > :zero'
                        }
                    },
                    {
                        Update: {
                            TableName: process.env.PROPERTY_TABLE,
                            Key: { propertyId },
                            UpdateExpression: 'SET occupiedBeds = occupiedBeds + :one, availableBeds = availableBeds - :one, updatedAt = :ts',
                            ExpressionAttributeValues: { ':one': 1, ':ts': timestamp }
                        }
                    }
                ]
            }).promise();
        }

        // Update room status if now full
        try {
            const updatedRoom = await propertyService.getRoomById(roomId);
            if (updatedRoom && updatedRoom.availableBeds === 0) {
                await propertyService.updateRoom(roomId, { status: 'occupied' });
            }
        } catch (_) {}

        // Auto-create rent payment record
        try {
            const financialService = require('../../services/financial.service');
            const checkInMonth = checkInDate ? checkInDate.slice(0, 7) : timestamp.slice(0, 7);
            await financialService.createRentPayment({
                tenantId,
                propertyId,
                roomId,
                amount: Number(rentAmount),
                paymentMonth: checkInMonth,
                dueDate: checkInDate || timestamp.slice(0, 10),
                paymentStatus: 'pending',
                notes: 'Auto-generated rent record from check-in invitation'
            });
        } catch (_) {}

        // Dispatch Welcome/Activation Email via Notification Service
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const ownerName = dbUser.name || property.propertyName || 'Property Owner';
        const loginUrl = `${frontendUrl}/login`;

        if (isNewUser && rawToken) {
            const activationUrl = `${frontendUrl}/activate?token=${rawToken}&id=${targetUserId}`;
            await notificationService.sendNotification({
                type: NOTIFICATION_EVENTS.TENANT_INVITATION,
                ownerId: dbUser.userId,
                tenantId,
                tenantEmail: sanitizedEmail,
                propertyId,
                data: {
                    tenantName: sanitizedName,
                    ownerName,
                    propertyName: property.propertyName,
                    roomNumber: room.roomNumber,
                    bedNumber,
                    rentAmount: Number(rentAmount),
                    activationUrl,
                    onboardingUrl: activationUrl,
                    loginUrl,
                    frontendUrl,
                    expiresHours: 2160
                },
                idempotencyKey: `INVITE#${tenantId}#${timestamp.slice(0, 10)}`
            });
        } else {
            // Existing user: send welcome tenancy assignment notice
            await notificationService.sendNotification({
                type: NOTIFICATION_EVENTS.TENANT_ASSIGNED,
                ownerId: dbUser.userId,
                tenantId,
                tenantEmail: sanitizedEmail,
                propertyId,
                data: {
                    tenantName: sanitizedName,
                    ownerName,
                    propertyName: property.propertyName,
                    roomNumber: room.roomNumber,
                    bedNumber,
                    rentAmount: Number(rentAmount),
                    loginUrl,
                    frontendUrl
                },
                idempotencyKey: `ASSIGN#${tenantId}#${timestamp.slice(0, 10)}`
            });
        }

        return response.success({
            message: isNewUser ? 'Tenant added and secure activation invitation sent successfully' : 'Tenant linked to existing account successfully',
            tenant: {
                tenantId: tenantItem.tenantId,
                userId: tenantItem.userId,
                propertyId: tenantItem.propertyId,
                roomId: tenantItem.roomId,
                bedNumber: tenantItem.bedNumber,
                name: tenantItem.name,
                email: tenantItem.email,
                phone: tenantItem.phone,
                checkInDate: tenantItem.checkInDate,
                rentAmount: tenantItem.rentAmount,
                status: tenantItem.status,
                onboardingStatus: tenantItem.onboardingStatus,
                isNewUser,
                createdAt: tenantItem.createdAt
            }
        }, 201);

    } catch (err) {
        console.error('Invite tenant error:', err);
        if (err.code === 'TransactionCanceledException') {
            return response.error('Check-in failed due to a conflict — bed may have been taken. Please retry.', 409);
        }
        return response.error(err.message || 'Failed to invite tenant', 500);
    }
};
