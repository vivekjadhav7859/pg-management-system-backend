const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const RENT_PAYMENT_TABLE = process.env.RENT_PAYMENT_TABLE;
const EXPENSE_TABLE = process.env.EXPENSE_TABLE;
const REMINDER_SETTINGS_TABLE = process.env.REMINDER_SETTINGS_TABLE;

// ==================== RENT COLLECTION ====================

/**
 * Create rent payment entry
 */
exports.createRentPayment = async (paymentData) => {
    try {
        const paymentId = uuidv4();
        const timestamp = new Date().toISOString();

        const item = {
            paymentId: paymentId,
            tenantId: paymentData.tenantId,
            propertyId: paymentData.propertyId,
            roomId: paymentData.roomId,
            
            // Payment Details
            amount: paymentData.amount,
            paymentMonth: paymentData.paymentMonth, // YYYY-MM format
            paymentDate: paymentData.paymentDate || timestamp,
            dueDate: paymentData.dueDate,
            
            // Payment Method
            paymentMode: paymentData.paymentMode, // online, offline, cash, cheque, bank_transfer
            paymentStatus: paymentData.paymentStatus || 'pending', // pending, completed, failed, overdue
            
            // Transaction Details
            transactionId: paymentData.transactionId || null,
            transactionRef: paymentData.transactionRef || null,
            
            // Additional Info & GST Compliance Readiness
            receiptNumber: paymentData.receiptNumber || `INV-${Date.now().toString().slice(-8)}`,
            sacCode: paymentData.sacCode || '997212', // Services provided by hostels/PG accommodation
            gstin: paymentData.gstin || null,
            taxableAmount: paymentData.taxableAmount || paymentData.amount,
            cgstAmount: paymentData.cgstAmount || 0,
            sgstAmount: paymentData.sgstAmount || 0,
            igstAmount: paymentData.igstAmount || 0,
            notes: paymentData.notes || null,
            lateFee: paymentData.lateFee || 0,
            discount: paymentData.discount || 0,
            finalAmount: paymentData.amount + (paymentData.lateFee || 0) - (paymentData.discount || 0) + (paymentData.cgstAmount || 0) + (paymentData.sgstAmount || 0) + (paymentData.igstAmount || 0),
            
            // Metadata
            createdAt: timestamp,
            updatedAt: timestamp,
            
            // GSI attributes
            tenantIdIndex: paymentData.tenantId,
            propertyIdIndex: paymentData.propertyId,
            paymentMonthIndex: paymentData.paymentMonth,
            statusIndex: paymentData.paymentStatus || 'pending'
        };

        const params = {
            TableName: RENT_PAYMENT_TABLE,
            Item: item
        };

        await dynamodb.put(params).promise();
        return item;

    } catch (error) {
        console.error('Error creating rent payment:', error);
        throw error;
    }
};

/**
 * Get rent payment by ID
 */
exports.getRentPaymentById = async (paymentId) => {
    try {
        const params = {
            TableName: RENT_PAYMENT_TABLE,
            Key: { paymentId }
        };

        const result = await dynamodb.get(params).promise();
        return result.Item || null;

    } catch (error) {
        console.error('Error getting rent payment:', error);
        throw error;
    }
};

/**
 * Get rent payments by property
 */
exports.getRentPaymentsByProperty = async (propertyId, limit = 50, lastEvaluatedKey = null) => {
    try {
        const params = {
            TableName: RENT_PAYMENT_TABLE,
            IndexName: 'PropertyIdIndex',
            KeyConditionExpression: 'propertyIdIndex = :propertyId',
            ExpressionAttributeValues: {
                ':propertyId': propertyId
            },
            ScanIndexForward: false, // Sort by newest first
            Limit: limit
        };

        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await dynamodb.query(params).promise();
        let payments = result.Items || [];

        if (payments.length === 0) {
            const scanParams = {
                TableName: RENT_PAYMENT_TABLE,
                FilterExpression: 'propertyId = :propertyId OR propertyIdIndex = :propertyId',
                ExpressionAttributeValues: {
                    ':propertyId': propertyId
                }
            };
            const scanResult = await dynamodb.scan(scanParams).promise();
            payments = scanResult.Items || [];
        }

        return {
            payments: payments,
            lastEvaluatedKey: result.LastEvaluatedKey || null
        };

    } catch (error) {
        console.error('Error getting rent payments by property:', error);
        throw error;
    }
};

/**
 * Get rent payments by tenant
 */
exports.getRentPaymentsByTenant = async (tenantId) => {
    try {
        const params = {
            TableName: RENT_PAYMENT_TABLE,
            IndexName: 'TenantIdIndex',
            KeyConditionExpression: 'tenantIdIndex = :tenantId',
            ExpressionAttributeValues: {
                ':tenantId': tenantId
            },
            ScanIndexForward: false
        };

        const result = await dynamodb.query(params).promise();
        return result.Items || [];

    } catch (error) {
        console.error('Error getting rent payments by tenant:', error);
        throw error;
    }
};

/**
 * Get rent payments by month
 */
exports.getRentPaymentsByMonth = async (propertyId, paymentMonth) => {
    try {
        const params = {
            TableName: RENT_PAYMENT_TABLE,
            IndexName: 'PaymentMonthIndex',
            KeyConditionExpression: 'paymentMonthIndex = :paymentMonth',
            FilterExpression: 'propertyId = :propertyId',
            ExpressionAttributeValues: {
                ':paymentMonth': paymentMonth,
                ':propertyId': propertyId
            }
        };

        const result = await dynamodb.query(params).promise();
        return result.Items || [];

    } catch (error) {
        console.error('Error getting rent payments by month:', error);
        throw error;
    }
};

/**
 * Update rent payment
 */
exports.updateRentPayment = async (paymentId, updates) => {
    try {
        const timestamp = new Date().toISOString();
        
        let updateExpression = 'SET updatedAt = :updatedAt';
        const expressionAttributeValues = {
            ':updatedAt': timestamp
        };
        const expressionAttributeNames = {};

        if (updates.paymentStatus !== undefined) {
            updateExpression += ', paymentStatus = :paymentStatus, statusIndex = :statusIndex';
            expressionAttributeValues[':paymentStatus'] = updates.paymentStatus;
            expressionAttributeValues[':statusIndex'] = updates.paymentStatus;
        }

        if (updates.paymentDate !== undefined) {
            updateExpression += ', paymentDate = :paymentDate';
            expressionAttributeValues[':paymentDate'] = updates.paymentDate;
        }

        if (updates.transactionId !== undefined) {
            updateExpression += ', transactionId = :transactionId';
            expressionAttributeValues[':transactionId'] = updates.transactionId;
        }

        if (updates.transactionRef !== undefined) {
            updateExpression += ', transactionRef = :transactionRef';
            expressionAttributeValues[':transactionRef'] = updates.transactionRef;
        }

        if (updates.receiptNumber !== undefined) {
            updateExpression += ', receiptNumber = :receiptNumber';
            expressionAttributeValues[':receiptNumber'] = updates.receiptNumber;
        }

        if (updates.notes !== undefined) {
            updateExpression += ', notes = :notes';
            expressionAttributeValues[':notes'] = updates.notes;
        }

        if (updates.lateFee !== undefined || updates.discount !== undefined) {
            const currentPayment = await this.getRentPaymentById(paymentId);
            const lateFee = updates.lateFee !== undefined ? updates.lateFee : currentPayment.lateFee;
            const discount = updates.discount !== undefined ? updates.discount : currentPayment.discount;
            const finalAmount = currentPayment.amount + lateFee - discount;
            
            updateExpression += ', lateFee = :lateFee, discount = :discount, finalAmount = :finalAmount';
            expressionAttributeValues[':lateFee'] = lateFee;
            expressionAttributeValues[':discount'] = discount;
            expressionAttributeValues[':finalAmount'] = finalAmount;
        }

        const params = {
            TableName: RENT_PAYMENT_TABLE,
            Key: { paymentId },
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
        console.error('Error updating rent payment:', error);
        throw error;
    }
};

// ==================== EXPENSE TRACKING ====================

/**
 * Create expense entry
 */
exports.createExpense = async (expenseData) => {
    try {
        const expenseId = uuidv4();
        const timestamp = new Date().toISOString();

        const item = {
            expenseId: expenseId,
            propertyId: expenseData.propertyId,
            
            // Expense Details
            expenseType: expenseData.expenseType, // utility, maintenance, salary, repair, other
            category: expenseData.category, // electricity, water, internet, cleaning, plumbing, etc.
            amount: expenseData.amount,
            expenseDate: expenseData.expenseDate || timestamp,
            expenseMonth: expenseData.expenseMonth, // YYYY-MM format
            
            // Payment Details
            paymentMode: expenseData.paymentMode, // cash, online, cheque, bank_transfer
            paidTo: expenseData.paidTo || null,
            billNumber: expenseData.billNumber || null,
            
            // Additional Info
            description: expenseData.description || null,
            notes: expenseData.notes || null,
            attachments: expenseData.attachments || [], // S3 URLs for bills/receipts
            recurring: expenseData.recurring !== undefined ? expenseData.recurring : false,
            frequency: expenseData.frequency || null,
            
            // Metadata
            createdAt: timestamp,
            updatedAt: timestamp,
            createdBy: expenseData.createdBy,
            
            // GSI attributes
            propertyIdIndex: expenseData.propertyId,
            expenseMonthIndex: expenseData.expenseMonth,
            expenseTypeIndex: expenseData.expenseType
        };

        const params = {
            TableName: EXPENSE_TABLE,
            Item: item
        };

        await dynamodb.put(params).promise();
        return item;

    } catch (error) {
        console.error('Error creating expense:', error);
        throw error;
    }
};

/**
 * Get expense by ID
 */
exports.getExpenseById = async (expenseId) => {
    try {
        const params = {
            TableName: EXPENSE_TABLE,
            Key: { expenseId }
        };

        const result = await dynamodb.get(params).promise();
        return result.Item || null;

    } catch (error) {
        console.error('Error getting expense:', error);
        throw error;
    }
};

/**
 * Get expenses by property
 */
exports.getExpensesByProperty = async (propertyId, limit = 50, lastEvaluatedKey = null) => {
    try {
        const params = {
            TableName: EXPENSE_TABLE,
            IndexName: 'PropertyIdIndex',
            KeyConditionExpression: 'propertyIdIndex = :propertyId',
            ExpressionAttributeValues: {
                ':propertyId': propertyId
            },
            ScanIndexForward: false,
            Limit: limit
        };

        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await dynamodb.query(params).promise();
        let expenses = result.Items || [];

        if (expenses.length === 0) {
            const scanParams = {
                TableName: EXPENSE_TABLE,
                FilterExpression: 'propertyId = :propertyId OR propertyIdIndex = :propertyId',
                ExpressionAttributeValues: {
                    ':propertyId': propertyId
                }
            };
            const scanResult = await dynamodb.scan(scanParams).promise();
            expenses = scanResult.Items || [];
        }

        return {
            expenses: expenses,
            lastEvaluatedKey: result.LastEvaluatedKey || null
        };

    } catch (error) {
        console.error('Error getting expenses by property:', error);
        throw error;
    }
};

/**
 * Get expenses by month
 */
exports.getExpensesByMonth = async (propertyId, expenseMonth) => {
    try {
        const params = {
            TableName: EXPENSE_TABLE,
            IndexName: 'ExpenseMonthIndex',
            KeyConditionExpression: 'expenseMonthIndex = :expenseMonth',
            FilterExpression: 'propertyId = :propertyId',
            ExpressionAttributeValues: {
                ':expenseMonth': expenseMonth,
                ':propertyId': propertyId
            }
        };

        const result = await dynamodb.query(params).promise();
        return result.Items || [];

    } catch (error) {
        console.error('Error getting expenses by month:', error);
        throw error;
    }
};

/**
 * Update expense
 */
exports.updateExpense = async (expenseId, updates) => {
    try {
        const timestamp = new Date().toISOString();
        
        let updateExpression = 'SET updatedAt = :updatedAt';
        const expressionAttributeValues = {
            ':updatedAt': timestamp
        };

        if (updates.expenseType !== undefined) {
            updateExpression += ', expenseType = :expenseType, expenseTypeIndex = :expenseTypeIndex';
            expressionAttributeValues[':expenseType'] = updates.expenseType;
            expressionAttributeValues[':expenseTypeIndex'] = updates.expenseType;
        }

        if (updates.category !== undefined) {
            updateExpression += ', category = :category';
            expressionAttributeValues[':category'] = updates.category;
        }

        if (updates.amount !== undefined) {
            updateExpression += ', amount = :amount';
            expressionAttributeValues[':amount'] = updates.amount;
        }

        if (updates.expenseDate !== undefined) {
            updateExpression += ', expenseDate = :expenseDate';
            expressionAttributeValues[':expenseDate'] = updates.expenseDate;
        }

        if (updates.expenseMonth !== undefined) {
            updateExpression += ', expenseMonth = :expenseMonth, expenseMonthIndex = :expenseMonthIndex';
            expressionAttributeValues[':expenseMonth'] = updates.expenseMonth;
            expressionAttributeValues[':expenseMonthIndex'] = updates.expenseMonth;
        }

        if (updates.paymentMode !== undefined) {
            updateExpression += ', paymentMode = :paymentMode';
            expressionAttributeValues[':paymentMode'] = updates.paymentMode;
        }

        if (updates.paidTo !== undefined) {
            updateExpression += ', paidTo = :paidTo';
            expressionAttributeValues[':paidTo'] = updates.paidTo;
        }

        if (updates.billNumber !== undefined) {
            updateExpression += ', billNumber = :billNumber';
            expressionAttributeValues[':billNumber'] = updates.billNumber;
        }

        if (updates.description !== undefined) {
            updateExpression += ', description = :description';
            expressionAttributeValues[':description'] = updates.description;
        }

        if (updates.notes !== undefined) {
            updateExpression += ', notes = :notes';
            expressionAttributeValues[':notes'] = updates.notes;
        }

        if (updates.attachments !== undefined) {
            updateExpression += ', attachments = :attachments';
            expressionAttributeValues[':attachments'] = updates.attachments;
        }

        if (updates.recurring !== undefined) {
            updateExpression += ', recurring = :recurring';
            expressionAttributeValues[':recurring'] = updates.recurring;
        }

        if (updates.frequency !== undefined) {
            updateExpression += ', frequency = :frequency';
            expressionAttributeValues[':frequency'] = updates.frequency;
        }

        const params = {
            TableName: EXPENSE_TABLE,
            Key: { expenseId },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamodb.update(params).promise();
        return result.Attributes;

    } catch (error) {
        console.error('Error updating expense:', error);
        throw error;
    }
};

/**
 * Delete expense
 */
exports.deleteExpense = async (expenseId) => {
    try {
        const params = {
            TableName: EXPENSE_TABLE,
            Key: { expenseId }
        };

        await dynamodb.delete(params).promise();
        return { deleted: true };

    } catch (error) {
        console.error('Error deleting expense:', error);
        throw error;
    }
};

// ==================== REPORTS & ANALYTICS ====================

/**
 * Generate monthly financial report
 */
exports.getMonthlyFinancialReport = async (propertyId, month) => {
    try {
        // Get rent payments for the month
        const rentPayments = await this.getRentPaymentsByMonth(propertyId, month);
        
        // Get expenses for the month
        const expenses = await this.getExpensesByMonth(propertyId, month);

        // Calculate totals
        const totalRentCollected = rentPayments
            .filter(p => p.paymentStatus === 'completed')
            .reduce((sum, p) => sum + (p.finalAmount ?? p.amount ?? 0), 0);

        const totalRentPending = rentPayments
            .filter(p => p.paymentStatus === 'pending' || p.paymentStatus === 'overdue')
            .reduce((sum, p) => sum + (p.finalAmount ?? p.amount ?? 0), 0);

        const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

        // Group expenses by type
        const expensesByType = expenses.reduce((acc, expense) => {
            if (!acc[expense.expenseType]) {
                acc[expense.expenseType] = 0;
            }
            acc[expense.expenseType] += expense.amount;
            return acc;
        }, {});

        const netProfit = totalRentCollected - totalExpenses;

        return {
            month: month,
            propertyId: propertyId,
            income: {
                totalRentCollected: totalRentCollected,
                totalRentPending: totalRentPending,
                totalRent: totalRentCollected + totalRentPending,
                paymentsCount: rentPayments.length,
                completedCount: rentPayments.filter(p => p.paymentStatus === 'completed').length,
                pendingCount: rentPayments.filter(p => p.paymentStatus === 'pending').length
            },
            expenses: {
                total: totalExpenses,
                byType: expensesByType,
                count: expenses.length
            },
            profitLoss: {
                netProfit: netProfit,
                profitMargin: totalRentCollected > 0 ? ((netProfit / totalRentCollected) * 100).toFixed(2) : 0
            }
        };

    } catch (error) {
        console.error('Error generating financial report:', error);
        throw error;
    }
};

// ==================== REMINDER SETTINGS ====================

/**
 * Get reminder settings for a property
 */
exports.getReminderSettings = async (propertyId) => {
    try {
        const params = {
            TableName: REMINDER_SETTINGS_TABLE,
            Key: { propertyId }
        };

        const result = await dynamodb.get(params).promise();
        return result.Item || null;

    } catch (error) {
        console.error('Error getting reminder settings:', error);
        throw error;
    }
};

/**
 * Create or update reminder settings for a property
 */
exports.updateReminderSettings = async (propertyId, settings) => {
    try {
        const timestamp = new Date().toISOString();

        const item = {
            propertyId: propertyId,
            autoEnabled: settings.autoEnabled !== undefined ? settings.autoEnabled : true,
            daysBefore: settings.daysBefore || 3,
            daysAfter: settings.daysAfter || 2,
            channels: settings.channels || ['email'],
            updatedAt: timestamp
        };

        // Persist emailConfig if provided (already encrypted by the handler)
        if (settings.emailConfig) {
            item.emailConfig = {
                provider: settings.emailConfig.provider,
                user: settings.emailConfig.user,
                encryptedPassword: settings.emailConfig.encryptedPassword,
                host: settings.emailConfig.host || null,
                port: settings.emailConfig.port || null
            };
        }

        const params = {
            TableName: REMINDER_SETTINGS_TABLE,
            Item: item
        };

        await dynamodb.put(params).promise();
        return item;

    } catch (error) {
        console.error('Error updating reminder settings:', error);
        throw error;
    }
};

/**
 * Get rent payments filtered by status
 */
exports.getRentPaymentsByStatus = async (propertyId, status) => {
    try {
        // Use StatusIndex GSI and filter by propertyId
        const params = {
            TableName: RENT_PAYMENT_TABLE,
            IndexName: 'StatusIndex',
            KeyConditionExpression: 'statusIndex = :status',
            FilterExpression: 'propertyId = :propertyId',
            ExpressionAttributeValues: {
                ':status': status,
                ':propertyId': propertyId
            }
        };

        const result = await dynamodb.query(params).promise();
        return result.Items || [];

    } catch (error) {
        console.error('Error getting payments by status:', error);
        throw error;
    }
};