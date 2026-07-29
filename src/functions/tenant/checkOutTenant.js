
const AWS = require('aws-sdk');
const propertyService = require('../../services/property.service');
const tenantService = require('../../services/tenant.service');
const response = require('../../utils/response');
const { guardOwnerWrite } = require('../../utils/subscriptionGuard');

const dynamodb = new AWS.DynamoDB.DocumentClient();

function bedAssignmentId(roomId, bedNumber) {
    return `reservation#${roomId}#${String(bedNumber).trim()}`;
}

exports.handler = async (event) => {
    try {
        response.setCorsOrigin(event);
        const dbUser = event.requestContext?.authorizer;
        if (!dbUser) {
            return response.error('Unauthorized', 401);
        }

        if (dbUser.userType !== 'owner' && dbUser.userType !== 'admin') {
            return response.error('Only owners can check-out tenants', 403);
        }

        const tenantId = event.pathParameters.tenantId;
        const tenant = await tenantService.getTenantById(tenantId);

        if (!tenant) {
            return response.error('Tenant not found', 404);
        }

        // Verify property ownership
        const property = await propertyService.getPropertyById(tenant.propertyId);
        if (!property) {
            return response.error('Property not found', 404);
        }
        if (property.ownerId !== dbUser.userId && dbUser.userType !== 'admin') {
            return response.error('You can only check-out tenants from your properties', 403);
        }

        const subscriptionDenied = await guardOwnerWrite(event);
        if (subscriptionDenied) return subscriptionDenied;

        if (tenant.status === 'checked_out') {
            return response.error('Tenant is already checked-out', 400);
        }

        const body = JSON.parse(event.body || '{}');
        const checkOutDate = body.checkOutDate || new Date().toISOString();
        const timestamp = new Date().toISOString();

        const assignmentId = bedAssignmentId(tenant.roomId, tenant.bedNumber);

        // ── Execute Atomic TransactWriteItems ──
        const transactItems = [
            // 1. Update Tenant Status
            {
                Update: {
                    TableName: process.env.TENANT_TABLE,
                    Key: { tenantId },
                    UpdateExpression: 'SET #status = :checked_out, statusIndex = :checked_out, tenancyStatus = :completed, checkOutDate = :checkOutDate, updatedAt = :ts',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':checked_out': 'checked_out',
                        ':completed': 'completed',
                        ':checkOutDate': checkOutDate,
                        ':ts': timestamp,
                        ':active': 'active',
                        ':inProgress': 'in_progress'
                    },
                    ConditionExpression: 'attribute_exists(tenantId) AND #status IN (:active, :inProgress)'
                }
            },
            // 2. Release Bed Assignment
            {
                Update: {
                    TableName: process.env.BED_ASSIGNMENT_TABLE,
                    Key: { assignmentId },
                    UpdateExpression: 'SET #status = :released, releasedDate = :ts, updatedAt = :ts',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':released': 'released',
                        ':ts': timestamp
                    }
                }
            },
            // 3. Decrement Room Occupancy
            {
                Update: {
                    TableName: process.env.ROOM_TABLE,
                    Key: { roomId: tenant.roomId },
                    UpdateExpression: 'SET occupiedBeds = occupiedBeds - :one, availableBeds = availableBeds + :one, updatedAt = :ts',
                    ExpressionAttributeValues: {
                        ':one': 1,
                        ':ts': timestamp,
                        ':zero': 0
                    },
                    ConditionExpression: 'occupiedBeds > :zero'
                }
            },
            // 4. Decrement Property Occupancy
            {
                Update: {
                    TableName: process.env.PROPERTY_TABLE,
                    Key: { propertyId: tenant.propertyId },
                    UpdateExpression: 'SET occupiedBeds = occupiedBeds - :one, availableBeds = availableBeds + :one, updatedAt = :ts',
                    ExpressionAttributeValues: {
                        ':one': 1,
                        ':ts': timestamp
                    }
                }
            }
        ];

        try {
            await dynamodb.transactWrite({ TransactItems: transactItems }).promise();
        } catch (txErr) {
            console.warn('Atomic checkout transaction failed, falling back to sequential releases:', txErr.message);
            // Fallback: execute updates if record structures differed
            await tenantService.checkOutTenant(tenantId, checkOutDate);
            await tenantService.releaseBedByTenant(tenantId);
            await propertyService.updateRoomOccupancy(tenant.roomId, -1);
            await propertyService.updatePropertyOccupancy(tenant.propertyId, -1);
        }

        // ── Post-Transaction Actions (Settlements & Room Status Sync) ──
        const settlementUpdates = {};
        if (body.roomInspectionStatus !== undefined) settlementUpdates.roomInspectionStatus = body.roomInspectionStatus;
        if (body.finalSettlementStatus !== undefined) settlementUpdates.finalSettlementStatus = body.finalSettlementStatus;
        if (body.depositRefundStatus !== undefined) settlementUpdates.depositRefundStatus = body.depositRefundStatus;
        if (body.refundAmount !== undefined) settlementUpdates.refundAmount = Number(body.refundAmount || 0);
        if (body.refundDate !== undefined) settlementUpdates.refundDate = body.refundDate;
        if (body.nocIssued !== undefined) {
            settlementUpdates.nocIssued = Boolean(body.nocIssued);
            settlementUpdates.nocIssuedAt = body.nocIssued ? new Date().toISOString() : null;
        }

        if (Object.keys(settlementUpdates).length > 0) {
            await tenantService.updateTenant(tenantId, settlementUpdates);
        }

        // Recalculate and synchronize room status & occupancy count
        try {
            await propertyService.recalculateRoomOccupancy(tenant.roomId);
        } catch (syncErr) {
            console.warn('Non-critical: room status sync after checkout encountered warning:', syncErr.message);
        }

        console.log('Tenant checked-out successfully (atomic):', tenantId);

        return response.success({
            message: 'Tenant checked-out successfully',
            tenantId: tenantId,
            checkOutDate: checkOutDate,
            settlement: settlementUpdates
        });

    } catch (err) {
        console.error('Check-out tenant error:', err);
        return response.error('Failed to check-out tenant', 500);
    }
};
