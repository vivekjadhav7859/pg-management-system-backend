const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const PROPERTY_TABLE = process.env.PROPERTY_TABLE;
const ROOM_TABLE = process.env.ROOM_TABLE;
const TENANT_TABLE = process.env.TENANT_TABLE;
const EXPENSE_TABLE = process.env.EXPENSE_TABLE;
const RENT_PAYMENT_TABLE = process.env.RENT_PAYMENT_TABLE;

exports.globalSearch = async (userId, query) => {
    const q = query.toLowerCase();

    // 1. Get properties for the user
    const propertiesResult = await dynamodb.query({
        TableName: PROPERTY_TABLE,
        IndexName: 'OwnerIdIndex',
        KeyConditionExpression: 'ownerIdIndex = :userId',
        ExpressionAttributeValues: { ':userId': userId }
    }).promise();
    const properties = propertiesResult.Items || [];
    const propertyIds = properties.map(p => p.propertyId);

    const filteredProperties = properties.filter(p => 
        (p.propertyName && p.propertyName.toLowerCase().includes(q)) || 
        (p.address && p.address.city && p.address.city.toLowerCase().includes(q))
    );

    if (propertyIds.length === 0) {
        return { properties: filteredProperties, rooms: [], tenants: [], invoices: [], expenses: [] };
    }

    const fetchPromises = propertyIds.map(async (propertyId) => {
        // Rooms
        const roomsP = dynamodb.query({
            TableName: ROOM_TABLE,
            IndexName: 'PropertyIdIndex',
            KeyConditionExpression: 'propertyIdIndex = :pid',
            ExpressionAttributeValues: { ':pid': propertyId }
        }).promise();

        // Tenants
        const tenantsP = dynamodb.query({
            TableName: TENANT_TABLE,
            IndexName: 'PropertyIdIndex',
            KeyConditionExpression: 'propertyIdIndex = :pid',
            ExpressionAttributeValues: { ':pid': propertyId }
        }).promise();

        // Expenses
        const expensesP = dynamodb.query({
            TableName: EXPENSE_TABLE,
            IndexName: 'PropertyIdIndex',
            KeyConditionExpression: 'propertyIdIndex = :pid',
            ExpressionAttributeValues: { ':pid': propertyId }
        }).promise();

        // Invoices (Rent Payments)
        const invoicesP = dynamodb.query({
            TableName: RENT_PAYMENT_TABLE,
            IndexName: 'PropertyIdIndex',
            KeyConditionExpression: 'propertyIdIndex = :pid',
            ExpressionAttributeValues: { ':pid': propertyId }
        }).promise();

        const [rooms, tenants, expenses, invoices] = await Promise.all([roomsP, tenantsP, expensesP, invoicesP]);

        return {
            rooms: rooms.Items || [],
            tenants: tenants.Items || [],
            expenses: expenses.Items || [],
            invoices: invoices.Items || []
        };
    });

    const results = await Promise.all(fetchPromises);

    let allRooms = [];
    let allTenants = [];
    let allExpenses = [];
    let allInvoices = [];

    results.forEach(res => {
        allRooms.push(...res.rooms);
        allTenants.push(...res.tenants);
        allExpenses.push(...res.expenses);
        allInvoices.push(...res.invoices);
    });

    // In-memory filtering
    const filteredRooms = allRooms.filter(r => 
        r.roomNumber && r.roomNumber.toLowerCase().includes(q)
    );
    const filteredTenants = allTenants.filter(t => 
        (t.personalInfo && t.personalInfo.name && t.personalInfo.name.toLowerCase().includes(q)) || 
        (t.personalInfo && t.personalInfo.email && t.personalInfo.email.toLowerCase().includes(q)) ||
        (t.personalInfo && t.personalInfo.phone && t.personalInfo.phone.includes(q))
    );
    const filteredExpenses = allExpenses.filter(e => 
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.expenseCategory && e.expenseCategory.toLowerCase().includes(q))
    );
    const filteredInvoices = allInvoices.filter(i => 
        (i.paymentId && i.paymentId.toLowerCase().includes(q)) ||
        (i.transactionId && i.transactionId.toLowerCase().includes(q)) ||
        (i.tenantName && i.tenantName.toLowerCase().includes(q))
    );

    return {
        properties: filteredProperties,
        rooms: filteredRooms,
        tenants: filteredTenants,
        expenses: filteredExpenses,
        invoices: filteredInvoices
    };
};
