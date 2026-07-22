const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const PROPERTY_TABLE = process.env.PROPERTY_TABLE;
const ROOM_TABLE = process.env.ROOM_TABLE;

/**
 * Create property entry in DynamoDB
 */
exports.createProperty = async (propertyData) => {
    try {
        const propertyId = uuidv4();
        const timestamp = new Date().toISOString();

        const item = {
            propertyId: propertyId,
            ownerId: propertyData.ownerId,
            propertyName: propertyData.propertyName,
            address: {
                street: propertyData.address.street,
                city: propertyData.address.city,
                state: propertyData.address.state,
                pincode: propertyData.address.pincode,
            },
            propertyType: propertyData.propertyType, // PG, Hostel, Apartment
            property_type: propertyData.property_type || 'co_live', // girls, boys, co_live
            totalRooms: propertyData.totalRooms || 0,
            totalBeds: propertyData.totalBeds || 0,
            occupiedBeds: 0,
            availableBeds: propertyData.totalBeds || 0,
            amenities: propertyData.amenities || [],
            rules: propertyData.rules || [],
            images: propertyData.images || [],
            mapLink: propertyData.mapLink || null,
            // Discovery-only listings remain free. Existing records without this
            // field are treated as managed properties for backwards compatibility.
            managementEnabled: propertyData.managementEnabled !== false,
            status: 'active', // active, inactive, maintenance
            createdAt: timestamp,
            updatedAt: timestamp,
            
            // For GSI queries
            ownerIdIndex: propertyData.ownerId,
            statusIndex: 'active'
        };

        const params = {
            TableName: PROPERTY_TABLE,
            Item: item
        };

        await dynamodb.put(params).promise();

        return item;

    } catch (error) {
        console.error('Error creating property:', error);
        throw error;
    }
};

/**
 * Get property by ID
 */
exports.getPropertyById = async (propertyId) => {
    try {
        const params = {
            TableName: PROPERTY_TABLE,
            Key: {
                propertyId: propertyId
            }
        };

        const result = await dynamodb.get(params).promise();
        return result.Item || null;

    } catch (error) {
        console.error('Error getting property:', error);
        throw error;
    }
};

/**
 * Get all properties by owner
 */
exports.getPropertiesByOwner = async (ownerId, limit = 50, lastEvaluatedKey = null) => {
    try {
        const params = {
            TableName: PROPERTY_TABLE,
            IndexName: 'OwnerIdIndex',
            KeyConditionExpression: 'ownerIdIndex = :ownerId',
            FilterExpression: '#status <> :deleted',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':ownerId': ownerId,
                ':deleted': 'deleted'
            },
            Limit: limit
        };

        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await dynamodb.query(params).promise();
        
        return {
            properties: result.Items || [],
            lastEvaluatedKey: result.LastEvaluatedKey || null
        };

    } catch (error) {
        console.error('Error getting properties by owner:', error);
        throw error;
    }
};

/**
 * Update property details
 */
exports.updateProperty = async (propertyId, updates) => {
    try {
        const timestamp = new Date().toISOString();
        
        let updateExpression = 'SET updatedAt = :updatedAt';
        const expressionAttributeValues = {
            ':updatedAt': timestamp
        };
        const expressionAttributeNames = {};

        if (updates.propertyName !== undefined) {
            updateExpression += ', propertyName = :propertyName';
            expressionAttributeValues[':propertyName'] = updates.propertyName;
        }

        if (updates.address !== undefined) {
            updateExpression += ', address = :address';
            expressionAttributeValues[':address'] = updates.address;
        }

        if (updates.propertyType !== undefined) {
            updateExpression += ', propertyType = :propertyType';
            expressionAttributeValues[':propertyType'] = updates.propertyType;
        }

        if (updates.property_type !== undefined) {
            updateExpression += ', property_type = :property_type';
            expressionAttributeValues[':property_type'] = updates.property_type;
        }

        if (updates.totalRooms !== undefined) {
            updateExpression += ', totalRooms = :totalRooms';
            expressionAttributeValues[':totalRooms'] = updates.totalRooms;
        }

        if (updates.totalBeds !== undefined) {
            updateExpression += ', totalBeds = :totalBeds';
            expressionAttributeValues[':totalBeds'] = updates.totalBeds;
        }

        if (updates.amenities !== undefined) {
            updateExpression += ', amenities = :amenities';
            expressionAttributeValues[':amenities'] = updates.amenities;
        }

        if (updates.rules !== undefined) {
            updateExpression += ', #rules = :rules';
            expressionAttributeValues[':rules'] = updates.rules;
            expressionAttributeNames['#rules'] = 'rules';
        }

        if (updates.images !== undefined) {
            updateExpression += ', images = :images';
            expressionAttributeValues[':images'] = updates.images;
        }

        if (updates.mapLink !== undefined) {
            updateExpression += ', mapLink = :mapLink';
            expressionAttributeValues[':mapLink'] = updates.mapLink;
        }

        if (updates.managementEnabled !== undefined) {
            updateExpression += ', managementEnabled = :managementEnabled';
            expressionAttributeValues[':managementEnabled'] = updates.managementEnabled;
        }

        if (updates.status !== undefined) {
            updateExpression += ', #status = :status, statusIndex = :statusIndex';
            expressionAttributeValues[':status'] = updates.status;
            expressionAttributeValues[':statusIndex'] = updates.status;
            expressionAttributeNames['#status'] = 'status';
        }

        if (updates.property_type !== undefined) {
            updateExpression += ', property_type = :property_type';
            expressionAttributeValues[':property_type'] = updates.property_type;
        }

        const params = {
            TableName: PROPERTY_TABLE,
            Key: {
                propertyId: propertyId
            },
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
        console.error('Error updating property:', error);
        throw error;
    }
};

/**
 * Delete property (soft delete)
 */
exports.deleteProperty = async (propertyId) => {
    try {
        const timestamp = new Date().toISOString();

        const params = {
            TableName: PROPERTY_TABLE,
            Key: {
                propertyId: propertyId
            },
            UpdateExpression: 'SET #status = :status, statusIndex = :statusIndex, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': 'deleted',
                ':statusIndex': 'deleted',
                ':updatedAt': timestamp
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamodb.update(params).promise();
        return result.Attributes;

    } catch (error) {
        console.error('Error deleting property:', error);
        throw error;
    }
};

/**
 * Update property occupancy (called when tenant checks in/out)
 */
exports.updatePropertyOccupancy = async (propertyId, bedsChange) => {
    try {
        const timestamp = new Date().toISOString();

        const params = {
            TableName: PROPERTY_TABLE,
            Key: {
                propertyId: propertyId
            },
            UpdateExpression: 'SET occupiedBeds = occupiedBeds + :change, availableBeds = availableBeds - :change, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':change': bedsChange,
                ':updatedAt': timestamp
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamodb.update(params).promise();
        return result.Attributes;

    } catch (error) {
        console.error('Error updating property occupancy:', error);
        throw error;
    }
};

// ==================== ROOM MANAGEMENT ====================

/**
 * Create room entry in DynamoDB
 */
exports.createRoom = async (roomData) => {
    try {
        const roomId = uuidv4();
        const timestamp = new Date().toISOString();

        const item = {
            roomId: roomId,
            propertyId: roomData.propertyId,
            roomNumber: roomData.roomNumber,
            roomType: roomData.roomType, // Single, Double, Triple, Dormitory
            floor: roomData.floor,
            totalBeds: roomData.totalBeds,
            occupiedBeds: 0,
            availableBeds: roomData.totalBeds,
            rentPerBed: roomData.rentPerBed,
            securityDeposit: roomData.securityDeposit,
            amenities: roomData.amenities || [],
            images: roomData.images || [],
            status: 'available', // available, occupied, maintenance
            createdAt: timestamp,
            updatedAt: timestamp,
            
            // For GSI queries
            propertyIdIndex: roomData.propertyId,
            statusIndex: 'available'
        };

        const params = {
            TableName: ROOM_TABLE,
            Item: item
        };

        await dynamodb.put(params).promise();

        return item;

    } catch (error) {
        console.error('Error creating room:', error);
        throw error;
    }
};

/**
 * Get room by ID
 */
exports.getRoomById = async (roomId) => {
    try {
        const params = {
            TableName: ROOM_TABLE,
            Key: {
                roomId: roomId
            }
        };

        const result = await dynamodb.get(params).promise();
        return result.Item || null;

    } catch (error) {
        console.error('Error getting room:', error);
        throw error;
    }
};

/**
 * Get all rooms by property
 */
exports.getRoomsByProperty = async (propertyId, limit = 50, lastEvaluatedKey = null) => {
    try {
        const params = {
            TableName: ROOM_TABLE,
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
            rooms: result.Items || [],
            lastEvaluatedKey: result.LastEvaluatedKey || null
        };

    } catch (error) {
        console.error('Error getting rooms by property:', error);
        throw error;
    }
};

/**
 * Update room details
 */
exports.updateRoom = async (roomId, updates) => {
    try {
        const timestamp = new Date().toISOString();
        
        let updateExpression = 'SET updatedAt = :updatedAt';
        const expressionAttributeValues = {
            ':updatedAt': timestamp
        };
        const expressionAttributeNames = {};

        if (updates.roomNumber !== undefined) {
            updateExpression += ', roomNumber = :roomNumber';
            expressionAttributeValues[':roomNumber'] = updates.roomNumber;
        }

        if (updates.roomType !== undefined) {
            updateExpression += ', roomType = :roomType';
            expressionAttributeValues[':roomType'] = updates.roomType;
        }

        if (updates.floor !== undefined) {
            updateExpression += ', floor = :floor';
            expressionAttributeValues[':floor'] = updates.floor;
        }

        if (updates.totalBeds !== undefined) {
            updateExpression += ', totalBeds = :totalBeds';
            expressionAttributeValues[':totalBeds'] = updates.totalBeds;
        }

        if (updates.occupiedBeds !== undefined) {
            updateExpression += ', occupiedBeds = :occupiedBeds';
            expressionAttributeValues[':occupiedBeds'] = updates.occupiedBeds;
        }

        if (updates.availableBeds !== undefined) {
            updateExpression += ', availableBeds = :availableBeds';
            expressionAttributeValues[':availableBeds'] = updates.availableBeds;
        }

        if (updates.rentPerBed !== undefined) {
            updateExpression += ', rentPerBed = :rentPerBed';
            expressionAttributeValues[':rentPerBed'] = updates.rentPerBed;
        }

        if (updates.securityDeposit !== undefined) {
            updateExpression += ', securityDeposit = :securityDeposit';
            expressionAttributeValues[':securityDeposit'] = updates.securityDeposit;
        }

        if (updates.amenities !== undefined) {
            updateExpression += ', amenities = :amenities';
            expressionAttributeValues[':amenities'] = updates.amenities;
        }

        if (updates.images !== undefined) {
            updateExpression += ', images = :images';
            expressionAttributeValues[':images'] = updates.images;
        }

        if (updates.status !== undefined) {
            updateExpression += ', #status = :status, statusIndex = :statusIndex';
            expressionAttributeValues[':status'] = updates.status;
            expressionAttributeValues[':statusIndex'] = updates.status;
            expressionAttributeNames['#status'] = 'status';
        }

        const params = {
            TableName: ROOM_TABLE,
            Key: {
                roomId: roomId
            },
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
        console.error('Error updating room:', error);
        throw error;
    }
};

/**
 * Delete room (soft delete)
 */
exports.deleteRoom = async (roomId) => {
    try {
        const timestamp = new Date().toISOString();

        const params = {
            TableName: ROOM_TABLE,
            Key: {
                roomId: roomId
            },
            UpdateExpression: 'SET #status = :status, statusIndex = :statusIndex, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': 'deleted',
                ':statusIndex': 'deleted',
                ':updatedAt': timestamp
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamodb.update(params).promise();
        return result.Attributes;

    } catch (error) {
        console.error('Error deleting room:', error);
        throw error;
    }
};

/**
 * Recalculate room occupancy and status based on active bed assignments
 */
exports.recalculateRoomOccupancy = async (roomId) => {
    try {
        const room = await exports.getRoomById(roomId);
        if (!room) return null;

        const tenantService = require('./tenant.service');
        const activeAssignments = await tenantService.getBedAssignmentsByRoom(roomId);
        const occupiedCount = activeAssignments.length;
        const totalBeds = Number(room.totalBeds) || 1;
        const availableBeds = Math.max(0, totalBeds - occupiedCount);

        let newStatus = room.status;
        if (room.status !== 'maintenance') {
            newStatus = availableBeds === 0 ? 'occupied' : 'available';
        }

        const timestamp = new Date().toISOString();
        const params = {
            TableName: ROOM_TABLE,
            Key: { roomId },
            UpdateExpression: 'SET occupiedBeds = :occ, availableBeds = :avail, #status = :status, statusIndex = :status, updatedAt = :ts',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':occ': occupiedCount,
                ':avail': availableBeds,
                ':status': newStatus,
                ':ts': timestamp
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamodb.update(params).promise();
        return result.Attributes;
    } catch (error) {
        console.error('Error recalculating room occupancy:', error);
        throw error;
    }
};

/**
 * Update room occupancy (called when bed is assigned/released)
 */
exports.updateRoomOccupancy = async (roomId, bedsChange) => {
    try {
        const timestamp = new Date().toISOString();

        const params = {
            TableName: ROOM_TABLE,
            Key: {
                roomId: roomId
            },
            UpdateExpression: 'SET occupiedBeds = occupiedBeds + :change, availableBeds = availableBeds - :change, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':change': bedsChange,
                ':updatedAt': timestamp
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamodb.update(params).promise();
        
        // Update room status based on occupancy
        const roomAttr = result.Attributes;
        if (roomAttr && roomAttr.status !== 'maintenance') {
            if (roomAttr.availableBeds <= 0 && roomAttr.status !== 'occupied') {
                await exports.updateRoom(roomId, { status: 'occupied' });
            } else if (roomAttr.availableBeds > 0 && roomAttr.status === 'occupied') {
                await exports.updateRoom(roomId, { status: 'available' });
            }
        }

        return result.Attributes;

    } catch (error) {
        console.error('Error updating room occupancy:', error);
        throw error;
    }
};

// ==================== BULK ROOM OPERATIONS ====================

/**
 * Fetch all room numbers that already exist for a given property.
 * Used for conflict detection before bulk insert.
 *
 * @param {string} propertyId
 * @returns {Promise<Set<string>>} Set of existing roomNumber strings
 */
exports.getExistingRoomNumbers = async (propertyId) => {
    try {
        const existingNumbers = new Set();
        let lastEvaluatedKey = null;

        // Paginate through ALL rooms for this property (no Limit cap)
        do {
            const params = {
                TableName: ROOM_TABLE,
                IndexName: 'PropertyIdIndex',
                KeyConditionExpression: 'propertyIdIndex = :propertyId',
                FilterExpression: '#status <> :deleted',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':propertyId': propertyId,
                    ':deleted': 'deleted'
                },
                ProjectionExpression: 'roomNumber'
            };

            if (lastEvaluatedKey) {
                params.ExclusiveStartKey = lastEvaluatedKey;
            }

            const result = await dynamodb.query(params).promise();

            (result.Items || []).forEach(item => {
                if (item.roomNumber) existingNumbers.add(item.roomNumber);
            });

            lastEvaluatedKey = result.LastEvaluatedKey || null;

        } while (lastEvaluatedKey);

        return existingNumbers;

    } catch (error) {
        console.error('Error fetching existing room numbers:', error);
        throw error;
    }
};

/**
 * Bulk-create rooms using DynamoDB TransactWriteItems.
 *
 * Chunks the rooms array into groups of 90 (DynamoDB hard-limits TransactWriteItems at 100;
 * we use 90 to leave headroom). Each chunk is atomic (all-or-nothing within the chunk).
 *
 * After all chunks succeed, updates property counters atomically with the exact count
 * of rooms and beds that were inserted.
 *
 * @param {Array<{roomNumber,roomType,floor,totalBeds,rentPerBed,securityDeposit,amenities}>} rooms
 * @param {string} propertyId
 * @returns {Promise<{created: Array, failed: Array}>}
 */
exports.bulkCreateRooms = async (rooms, propertyId) => {
    const CHUNK_SIZE = 90;
    const timestamp = new Date().toISOString();

    const createdRooms = [];
    const failedRooms = [];

    // Build all room items first (assign IDs and timestamps)
    const roomItems = rooms.map(room => ({
        roomId: uuidv4(),
        propertyId: propertyId,
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        floor: room.floor,
        totalBeds: room.totalBeds,
        occupiedBeds: 0,
        availableBeds: room.totalBeds,
        rentPerBed: room.rentPerBed,
        securityDeposit: room.securityDeposit || 0,
        amenities: room.amenities || [],
        images: [],
        status: 'available',
        createdAt: timestamp,
        updatedAt: timestamp,
        // GSI attributes
        propertyIdIndex: propertyId,
        statusIndex: 'available'
    }));

    // Chunk into groups of CHUNK_SIZE
    for (let i = 0; i < roomItems.length; i += CHUNK_SIZE) {
        const chunk = roomItems.slice(i, i + CHUNK_SIZE);

        const transactItems = chunk.map(item => ({
            Put: {
                TableName: ROOM_TABLE,
                Item: item
            }
        }));

        try {
            await dynamodb.transactWrite({ TransactItems: transactItems }).promise();
            createdRooms.push(...chunk);
        } catch (error) {
            console.error(`Bulk room insert chunk ${Math.floor(i / CHUNK_SIZE) + 1} failed:`, error);
            // Record all rooms in this chunk as failed
            failedRooms.push(...chunk.map(r => ({
                roomNumber: r.roomNumber,
                reason: 'Transaction failed'
            })));
        }
    }

    // Atomically update property counters for successfully created rooms
    if (createdRooms.length > 0) {
        const totalNewBeds = createdRooms.reduce((acc, r) => acc + r.totalBeds, 0);
        const timestamp2 = new Date().toISOString();

        try {
            await dynamodb.update({
                TableName: PROPERTY_TABLE,
                Key: { propertyId: propertyId },
                UpdateExpression: 'ADD totalRooms :roomCount, totalBeds :bedCount, availableBeds :bedCount SET updatedAt = :ts',
                ExpressionAttributeValues: {
                    ':roomCount': createdRooms.length,
                    ':bedCount': totalNewBeds,
                    ':ts': timestamp2
                },
                ReturnValues: 'ALL_NEW'
            }).promise();
        } catch (error) {
            console.error('Failed to update property counters after bulk room insert:', error);
            // Non-fatal — rooms were created; counters can be recalculated
        }
    }

    return { created: createdRooms, failed: failedRooms };
};
