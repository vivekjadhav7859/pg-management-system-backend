const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const TENANT_TABLE = process.env.TENANT_TABLE;
const BED_ASSIGNMENT_TABLE = process.env.BED_ASSIGNMENT_TABLE;
const S3_BUCKET = process.env.S3_BUCKET;

/**
 * Create tenant entry (Check-in)
 */
exports.createTenant = async (tenantData) => {
    try {
        const tenantId = uuidv4();
        const timestamp = new Date().toISOString();

        const item = {
            tenantId: tenantId,
            userId: tenantData.userId, // Reference to Users table
            propertyId: tenantData.propertyId,
            roomId: tenantData.roomId,
            bedNumber: tenantData.bedNumber,
            
            // Personal Information
            name: tenantData.name,
            email: tenantData.email,
            phone: tenantData.phone,
            emergencyContact: tenantData.emergencyContact || {},
            
            // KYC Documents
            kycDocuments: tenantData.kycDocuments || {},
            kycStatus: tenantData.kycStatus || 'pending', // pending, submitted, verified, rejected
            
            // Tenancy Details
            checkInDate: tenantData.checkInDate,
            checkOutDate: tenantData.checkOutDate || null,
            rentAmount: tenantData.rentAmount,
            securityDeposit: tenantData.securityDeposit,
            
            // Payment Status
            depositPaid: tenantData.depositPaid || false,
            depositAmount: tenantData.depositAmount || 0,
            depositDate: tenantData.depositDate || null,
            
            // Status
            status: tenantData.status || 'in_progress', // in_progress, active, checked_out, suspended
            tenancyStatus: tenantData.tenancyStatus || 'onboarding', // onboarding, ongoing, completed, terminated
            
            // Metadata
            createdAt: timestamp,
            updatedAt: timestamp,
            
            // GSI attributes
            propertyIdIndex: tenantData.propertyId,
            roomIdIndex: tenantData.roomId,
            userIdIndex: tenantData.userId,
            statusIndex: tenantData.status || 'in_progress'
        };

        const params = {
            TableName: TENANT_TABLE,
            Item: item
        };

        await dynamodb.put(params).promise();

        return item;

    } catch (error) {
        console.error('Error creating tenant:', error);
        throw error;
    }
};

/**
 * Get tenant by ID
 */
exports.getTenantById = async (tenantId) => {
    try {
        const params = {
            TableName: TENANT_TABLE,
            Key: { tenantId }
        };

        const result = await dynamodb.get(params).promise();
        return result.Item || null;

    } catch (error) {
        console.error('Error getting tenant:', error);
        throw error;
    }
};

/**
 * Get all tenants by property
 */
exports.getTenantsByProperty = async (propertyId, limit = 50, lastEvaluatedKey = null) => {
    try {
        const params = {
            TableName: TENANT_TABLE,
            IndexName: 'PropertyIdIndex',
            KeyConditionExpression: 'propertyIdIndex = :propertyId',
            ExpressionAttributeValues: {
                ':propertyId': propertyId
            },
            Limit: limit
        };

        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await dynamodb.query(params).promise();
        
        return {
            tenants: result.Items || [],
            lastEvaluatedKey: result.LastEvaluatedKey || null
        };

    } catch (error) {
        console.error('Error getting tenants by property:', error);
        throw error;
    }
};

/**
 * Get active tenants by room
 */
exports.getActiveTenantsByRoom = async (roomId) => {
    try {
        const params = {
            TableName: TENANT_TABLE,
            IndexName: 'RoomIdIndex',
            KeyConditionExpression: 'roomIdIndex = :roomId',
            FilterExpression: '#status IN (:active, :inProgress)',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':roomId': roomId,
                ':active': 'active',
                ':inProgress': 'in_progress'
            }
        };

        const result = await dynamodb.query(params).promise();
        return result.Items || [];

    } catch (error) {
        console.error('Error getting active tenants by room:', error);
        throw error;
    }
};

/**
 * Update tenant details
 */
exports.updateTenant = async (tenantId, updates) => {
    try {
        const timestamp = new Date().toISOString();
        
        let updateExpression = 'SET updatedAt = :updatedAt';
        const expressionAttributeValues = {
            ':updatedAt': timestamp
        };
        const expressionAttributeNames = {};

        if (updates.name !== undefined) {
            updateExpression += ', #name = :name';
            expressionAttributeValues[':name'] = updates.name;
            expressionAttributeNames['#name'] = 'name';
        }

        if (updates.phone !== undefined) {
            updateExpression += ', phone = :phone';
            expressionAttributeValues[':phone'] = updates.phone;
        }

        if (updates.emergencyContact !== undefined) {
            updateExpression += ', emergencyContact = :emergencyContact';
            expressionAttributeValues[':emergencyContact'] = updates.emergencyContact;
        }

        if (updates.kycDocuments !== undefined) {
            updateExpression += ', kycDocuments = :kycDocuments';
            expressionAttributeValues[':kycDocuments'] = updates.kycDocuments;
        }

        if (updates.kycStatus !== undefined) {
            updateExpression += ', kycStatus = :kycStatus';
            expressionAttributeValues[':kycStatus'] = updates.kycStatus;
        }

        if (updates.kycReviewedAt !== undefined) {
            updateExpression += ', kycReviewedAt = :kycReviewedAt';
            expressionAttributeValues[':kycReviewedAt'] = updates.kycReviewedAt;
        }

        if (updates.kycReviewNotes !== undefined) {
            updateExpression += ', kycReviewNotes = :kycReviewNotes';
            expressionAttributeValues[':kycReviewNotes'] = updates.kycReviewNotes;
        }

        if (updates.rentAmount !== undefined) {
            updateExpression += ', rentAmount = :rentAmount';
            expressionAttributeValues[':rentAmount'] = updates.rentAmount;
        }

        if (updates.checkOutDate !== undefined) {
            updateExpression += ', checkOutDate = :checkOutDate';
            expressionAttributeValues[':checkOutDate'] = updates.checkOutDate;
        }

        if (updates.status !== undefined) {
            updateExpression += ', #status = :status, statusIndex = :statusIndex';
            expressionAttributeValues[':status'] = updates.status;
            expressionAttributeValues[':statusIndex'] = updates.status;
            expressionAttributeNames['#status'] = 'status';
        }

        if (updates.tenancyStatus !== undefined) {
            updateExpression += ', tenancyStatus = :tenancyStatus';
            expressionAttributeValues[':tenancyStatus'] = updates.tenancyStatus;
        }

        if (updates.depositPaid !== undefined) {
            updateExpression += ', depositPaid = :depositPaid';
            expressionAttributeValues[':depositPaid'] = updates.depositPaid;
        }

        if (updates.depositAmount !== undefined) {
            updateExpression += ', depositAmount = :depositAmount';
            expressionAttributeValues[':depositAmount'] = updates.depositAmount;
        }

        if (updates.depositDate !== undefined) {
            updateExpression += ', depositDate = :depositDate';
            expressionAttributeValues[':depositDate'] = updates.depositDate;
        }

        const optionalFields = [
            'agreementStatus',
            'agreementSignedAt',
            'agreementAcceptedBy',
            'roomInspectionStatus',
            'finalSettlementStatus',
            'depositRefundStatus',
            'refundAmount',
            'refundDate',
            'nocIssued',
            'nocIssuedAt',
        ];

        optionalFields.forEach((field) => {
            if (updates[field] !== undefined) {
                updateExpression += `, ${field} = :${field}`;
                expressionAttributeValues[`:${field}`] = updates[field];
            }
        });

        const params = {
            TableName: TENANT_TABLE,
            Key: { tenantId },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        };

        if (Object.keys(expressionAttributeNames).length > 0) {
            params.ExpressionAttributeNames = expressionAttributeNames;
        }

        const result = await dynamodb.update(params).promise();
        return result.Attributes;

    } catch (error) {
        console.error('Error updating tenant:', error);
        throw error;
    }
};

/**
 * Check-out tenant
 */
exports.checkOutTenant = async (tenantId, checkOutDate) => {
    try {
        const timestamp = new Date().toISOString();

        const params = {
            TableName: TENANT_TABLE,
            Key: { tenantId },
            UpdateExpression: 'SET #status = :status, statusIndex = :statusIndex, tenancyStatus = :tenancyStatus, checkOutDate = :checkOutDate, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': 'checked_out',
                ':statusIndex': 'checked_out',
                ':tenancyStatus': 'completed',
                ':checkOutDate': checkOutDate,
                ':updatedAt': timestamp
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamodb.update(params).promise();
        return result.Attributes;

    } catch (error) {
        console.error('Error checking out tenant:', error);
        throw error;
    }
};

/**
 * Generate presigned URL for KYC document upload
 */
exports.generateUploadUrl = async (tenantId, documentType, fileExtension, contentType = null) => {
    try {
        const normalizedExtension = String(fileExtension || '').toLowerCase().replace(/^\./, '');
        const resolvedContentType = contentType || (
            normalizedExtension === 'pdf'
                ? 'application/pdf'
                : normalizedExtension === 'jpg'
                ? 'image/jpeg'
                : `image/${normalizedExtension}`
        );
        const key = `kyc/${tenantId}/${documentType}-${Date.now()}.${normalizedExtension}`;
        
        const params = {
            Bucket: S3_BUCKET,
            Key: key,
            Expires: 300, // 5 minutes
            ContentType: resolvedContentType
        };

        const uploadUrl = await s3.getSignedUrlPromise('putObject', params);
        
        return {
            uploadUrl,
            key,
            documentUrl: `https://${S3_BUCKET}.s3.amazonaws.com/${key}`,
            contentType: resolvedContentType
        };

    } catch (error) {
        console.error('Error generating upload URL:', error);
        throw error;
    }
};

/**
 * Get tenant by user ID
 */
exports.getTenantByUserId = async (userId) => {
    try {
        const params = {
            TableName: TENANT_TABLE,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userIdIndex = :userId',
            FilterExpression: '#status IN (:active, :inProgress)',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':userId': userId,
                ':active': 'active',
                ':inProgress': 'in_progress'
            }
        };

        const result = await dynamodb.query(params).promise();
        return result.Items && result.Items.length > 0 ? result.Items[0] : null;

    } catch (error) {
        console.error('Error getting tenant by user ID:', error);
        throw error;
    }
};

// ==================== BED ASSIGNMENT ====================

/**
 * Assign bed to tenant
 */
exports.assignBed = async (assignmentData) => {
    try {
        const assignmentId = uuidv4();
        const timestamp = new Date().toISOString();

        const item = {
            assignmentId: assignmentId,
            tenantId: assignmentData.tenantId,
            propertyId: assignmentData.propertyId,
            roomId: assignmentData.roomId,
            bedNumber: assignmentData.bedNumber,
            assignedDate: assignmentData.assignedDate || timestamp,
            releasedDate: null,
            status: 'assigned', // assigned, released
            createdAt: timestamp,
            updatedAt: timestamp,
            
            // GSI attributes
            roomIdIndex: assignmentData.roomId,
            tenantIdIndex: assignmentData.tenantId
        };

        const params = {
            TableName: BED_ASSIGNMENT_TABLE,
            Item: item
        };

        await dynamodb.put(params).promise();

        return item;

    } catch (error) {
        console.error('Error assigning bed:', error);
        throw error;
    }
};

/**
 * Release bed
 */
exports.releaseBed = async (assignmentId) => {
    try {
        const timestamp = new Date().toISOString();

        const params = {
            TableName: BED_ASSIGNMENT_TABLE,
            Key: { assignmentId },
            UpdateExpression: 'SET #status = :status, releasedDate = :releasedDate, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': 'released',
                ':releasedDate': timestamp,
                ':updatedAt': timestamp
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamodb.update(params).promise();
        return result.Attributes;

    } catch (error) {
        console.error('Error releasing bed:', error);
        throw error;
    }
};

/**
 * Get active bed assignments by room.
 * Reserved beds are intentionally included because they must not be offered to
 * another tenant while onboarding/KYC is still pending.
 */
exports.getBedAssignmentsByRoom = async (roomId) => {
    try {
        const params = {
            TableName: BED_ASSIGNMENT_TABLE,
            IndexName: 'RoomIdIndex',
            KeyConditionExpression: 'roomIdIndex = :roomId',
            FilterExpression: '#status IN (:assigned, :reserved)',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':roomId': roomId,
                ':assigned': 'assigned',
                ':reserved': 'reserved'
            }
        };

        const result = await dynamodb.query(params).promise();
        return result.Items || [];

    } catch (error) {
        console.error('Error getting bed assignments:', error);
        throw error;
    }
};
