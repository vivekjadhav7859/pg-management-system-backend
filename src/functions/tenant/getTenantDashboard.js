const AWS = require('aws-sdk');
const response = require('../../utils/response');
const { sendOwnerRequestEmail } = require('../../utils/ownerRequestEmail');
const { createTenantJoinRequest } = require('../../utils/tenantJoinRequest');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const { userId, userType } = event.requestContext.authorizer;
        if (userType !== 'tenant') return response.error('Forbidden', 403);

        // 1. Get user profile to find linkedPropertyId
        const userResult = await dynamodb.get({
            TableName: process.env.USER_TABLE,
            Key: { userId },
        }).promise();
        const user = userResult.Item;
        if (!user) return response.error('User not found', 404);

        // 2. Find tenant record linked to this userId
        const tenantResult = await dynamodb.query({
            TableName: process.env.TENANT_TABLE,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userIdIndex = :uid',
            ExpressionAttributeValues: { ':uid': userId },
        }).promise();

        const tenant = (tenantResult.Items || []).find(t => ['active', 'in_progress'].includes(t.status));

        if (!tenant) {
            let linkedPropertyName = null;
            let owner = null;
            let linkedProperty = null;
            let ownerUser = null;
            if (user.linkedPropertyId) {
                const linkedPropResult = await dynamodb.get({
                    TableName: process.env.PROPERTY_TABLE,
                    Key: { propertyId: user.linkedPropertyId },
                }).promise();
                linkedProperty = linkedPropResult.Item;
                linkedPropertyName = linkedProperty?.propertyName || null;

                if (linkedProperty?.ownerId) {
                    const ownerResult = await dynamodb.get({
                        TableName: process.env.USER_TABLE,
                        Key: { userId: linkedProperty.ownerId },
                    }).promise();
                    ownerUser = ownerResult.Item || null;
                    if (ownerUser) {
                        owner = {
                            name: ownerUser.name,
                            email: ownerUser.email,
                            phone: ownerUser.phoneNumber || ownerUser.phone,
                        };
                    }
                }
            }

            if (linkedProperty && ownerUser) {
                const joinRequest = await createTenantJoinRequest({
                    owner: ownerUser,
                    tenant: user,
                    property: linkedProperty,
                });

                if (joinRequest?.created && ownerUser.email) {
                    await sendOwnerRequestEmail({
                        owner: ownerUser,
                        tenant: {
                            userId: user.userId,
                            name: user.name,
                            email: user.email,
                            phone: user.phoneNumber || user.phone,
                        },
                        property: linkedProperty,
                        requestTitle: 'Tenant Join Request',
                        requestType: 'tenant_join',
                        message: 'Tenant is linked through an invitation code and is waiting for room allocation and check-in.',
                    }).catch((emailErr) => {
                        console.warn('[getTenantDashboard] non-critical owner email failed', emailErr.message);
                    });
                }
            }

            // Tenant logged in but not yet checked in by owner
            return response.success({
                status: 'pending_checkin',
                linkedPropertyId: user.linkedPropertyId || null,
                linkedPropertyName,
                tenant: null,
                room: null,
                payments: [],
                complaints: [],
                notices: [],
                owner,
            });
        }

        // 3. Get room details
        const roomResult = await dynamodb.get({
            TableName: process.env.ROOM_TABLE,
            Key: { roomId: tenant.roomId },
        }).promise();
        const room = roomResult.Item;

        // 4. Get property info
        const propResult = await dynamodb.get({
            TableName: process.env.PROPERTY_TABLE,
            Key: { propertyId: tenant.propertyId },
        }).promise();
        const property = propResult.Item;

        // 5. Get last 12 rent payments for this tenant
        const paymentsResult = await dynamodb.query({
            TableName: process.env.RENT_PAYMENT_TABLE,
            IndexName: 'TenantIdIndex',
            KeyConditionExpression: 'tenantIdIndex = :tid',
            ExpressionAttributeValues: { ':tid': tenant.tenantId },
            ScanIndexForward: false,
            Limit: 12,
        }).promise();

        const complaintsResult = await dynamodb.query({
            TableName: process.env.COMPLAINTS_TABLE,
            IndexName: 'TenantIdIndex',
            KeyConditionExpression: 'tenantIdIndex = :tid',
            ExpressionAttributeValues: { ':tid': tenant.tenantId },
            ScanIndexForward: false,
            Limit: 8,
        }).promise();

        const noticesResult = await dynamodb.query({
            TableName: process.env.NOTIFICATION_TABLE,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userIdIndex = :uid',
            ExpressionAttributeValues: { ':uid': userId },
            ScanIndexForward: false,
            Limit: 8,
        }).promise();

        let owner = null;
        if (property?.ownerId) {
            const ownerResult = await dynamodb.get({
                TableName: process.env.USER_TABLE,
                Key: { userId: property.ownerId },
            }).promise();
            if (ownerResult.Item) {
                owner = {
                    name: ownerResult.Item.name,
                    email: ownerResult.Item.email,
                    phone: ownerResult.Item.phoneNumber || ownerResult.Item.phone,
                };
            }
        }

        const payments = (paymentsResult.Items || []).map(p => ({
            paymentId: p.paymentId,
            paymentMonth: p.paymentMonth,
            amount: p.amount,
            finalAmount: p.finalAmount,
            paymentStatus: p.paymentStatus,
            paymentDate: p.paymentDate,
            dueDate: p.dueDate,
            paymentMode: p.paymentMode,
            transactionId: p.transactionId,
            receiptNumber: p.receiptNumber,
            lateFee: p.lateFee || 0,
            discount: p.discount || 0,
        }));

        return response.success({
            status: tenant.status || 'in_progress',
            tenant: {
                tenantId: tenant.tenantId,
                name: tenant.name,
                email: tenant.email,
                phone: tenant.phone,
                checkInDate: tenant.checkInDate,
                rentAmount: tenant.rentAmount,
                securityDeposit: tenant.securityDeposit,
                depositPaid: tenant.depositPaid,
                bedNumber: tenant.bedNumber,
                kycStatus: tenant.kycStatus,
                status: tenant.status,
                tenancyStatus: tenant.tenancyStatus,
                emergencyContact: tenant.emergencyContact || {},
                agreementStatus: tenant.agreementStatus || 'pending',
                agreementSignedAt: tenant.agreementSignedAt || null,
                roomInspectionStatus: tenant.roomInspectionStatus || null,
                finalSettlementStatus: tenant.finalSettlementStatus || null,
                depositRefundStatus: tenant.depositRefundStatus || null,
                refundAmount: tenant.refundAmount || 0,
                refundDate: tenant.refundDate || null,
                nocIssued: Boolean(tenant.nocIssued),
                nocIssuedAt: tenant.nocIssuedAt || null,
            },
            property: {
                propertyId: property?.propertyId,
                propertyName: property?.propertyName,
                address: property?.address,
            },
            room: {
                roomId: room?.roomId,
                roomNumber: room?.roomNumber,
                roomType: room?.roomType,
                floor: room?.floor,
                totalBeds: room?.totalBeds,
                rentPerBed: room?.rentPerBed,
            },
            payments,
            complaints: complaintsResult.Items || [],
            notices: noticesResult.Items || [],
            owner,
        });
    } catch (err) {
        console.error('[getTenantDashboard]', err);
        return response.error(err.message || 'Internal server error', 500);
    }
};
