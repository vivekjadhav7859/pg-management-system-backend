const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.NOTIFICATION_TABLE;

exports.createNotification = async (userId, propertyId, type, title, description, entityId, entityType) => {
  const notificationId = uuidv4();
  const timestamp = new Date().toISOString();

  const item = {
    id: notificationId,
    userIdIndex: userId,
    propertyIdIndex: propertyId,
    type,
    title,
    description,
    entityId,
    entityType,
    read: false,
    createdAt: timestamp,
    createdAtIndex: timestamp
  };

  await dynamodb.put({
    TableName: TABLE_NAME,
    Item: item,
  }).promise();

  return item;
};

exports.getNotifications = async (userId) => {
  const params = {
    TableName: TABLE_NAME,
    IndexName: 'UserIdIndex',
    KeyConditionExpression: 'userIdIndex = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
    ScanIndexForward: false,
  };

  const result = await dynamodb.query(params).promise();
  return result.Items;
};

exports.markRead = async (notificationId) => {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      id: notificationId
    },
    UpdateExpression: 'SET #read = :readVal',
    ExpressionAttributeNames: {
      '#read': 'read'
    },
    ExpressionAttributeValues: {
      ':readVal': true
    },
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamodb.update(params).promise();
  return result.Attributes;
};

exports.markAllRead = async (userId) => {
    const params = {
        TableName: TABLE_NAME,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userIdIndex = :userId',
        FilterExpression: '#read = :falseVal',
        ExpressionAttributeNames: {
            '#read': 'read'
        },
        ExpressionAttributeValues: {
            ':userId': userId,
            ':falseVal': false
        }
    };
    const result = await dynamodb.query(params).promise();
    const unreadItems = result.Items || [];
    
    if(unreadItems.length === 0) return 0;
    
    const updates = unreadItems.map(item => {
        return dynamodb.update({
            TableName: TABLE_NAME,
            Key: { id: item.id },
            UpdateExpression: 'SET #read = :readVal',
            ExpressionAttributeNames: { '#read': 'read' },
            ExpressionAttributeValues: { ':readVal': true }
        }).promise();
    });
    
    await Promise.all(updates);
    return unreadItems.length;
};

exports.markUnread = async (notificationId) => {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      id: notificationId
    },
    UpdateExpression: 'SET #read = :readVal',
    ExpressionAttributeNames: {
      '#read': 'read'
    },
    ExpressionAttributeValues: {
      ':readVal': false
    },
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamodb.update(params).promise();
  return result.Attributes;
};

exports.deleteNotification = async (notificationId) => {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      id: notificationId
    }
  };

  await dynamodb.delete(params).promise();
  return { id: notificationId };
};

// Phase 4.1: WhatsApp Channel Integration Stub
exports.sendWhatsAppMessage = async (phoneNumber, templateId, parameters = {}) => {
  try {
    console.log(`[WhatsApp] Sending message to ${phoneNumber} using template ${templateId}`);
    // Implementation for Twilio/WATI API goes here
    // const payload = { to: phoneNumber, type: 'template', template: { name: templateId, language: { code: 'en' }, components: [...] } };
    // await axios.post(WHATSAPP_API_URL, payload, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
    
    return { success: true, messageId: uuidv4() };
  } catch (error) {
    console.error('[WhatsApp] Error sending message:', error);
    return { success: false, error: error.message };
  }
};
