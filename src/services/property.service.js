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
                country: propertyData.address.country || 'India'
            },
            propertyType: propertyData.propertyType, // PG, Hostel, Apartment
            totalRooms: propertyData.totalRooms || 0,
            totalBeds: propertyData.totalBeds || 0,
            occupiedBeds: 0,
            availableBeds: propertyData.totalBeds || 0,
            amenities: propertyData.amenities || [],
            rules: propertyData.rules || [],
            images: propertyData.images || [],
            property_type: propertyData.property_type,
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
        if (result.Attributes.availableBeds === 0) {
            await exports.updateRoom(roomId, { status: 'occupied' });
        } else if (result.Attributes.availableBeds > 0 && result.Attributes.status === 'occupied') {
            await exports.updateRoom(roomId, { status: 'available' });
        }

        return result.Attributes;

    } catch (error) {
        console.error('Error updating room occupancy:', error);
        throw error;
    }
};