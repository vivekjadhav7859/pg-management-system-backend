/**
 * DEPLOYMENT VERIFICATION SCRIPT
 * Purpose: Verify that properties table has correct schema and data
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const dynamoDBService = new AWS.DynamoDB();

const PROPERTIES_TABLE = process.env.PROPERTY_TABLE || 'pg-management-backend-properties-dev';

async function verifyDeployment() {
    console.log('🔍 DEPLOYMENT VERIFICATION');
    console.log('='.repeat(60));
    console.log('');

    try {
        // 1. Check if table exists
        console.log('1️⃣ Checking if Properties table exists...');
        const tableDescription = await dynamoDBService.describeTable({
            TableName: PROPERTIES_TABLE
        }).promise();
        console.log(`✅ Table exists: ${PROPERTIES_TABLE}`);
        console.log('');

        // 2. Check GSI
        console.log('2️⃣ Checking Global Secondary Indexes...');
        const gsiList = tableDescription.Table.GlobalSecondaryIndexes || [];
        const ownerIdIndex = gsiList.find(gsi => gsi.IndexName === 'OwnerIdIndex');

        if (ownerIdIndex) {
            console.log(`✅ OwnerIdIndex exists`);
            console.log(`   Status: ${ownerIdIndex.IndexStatus}`);
            console.log(`   Partition Key: ${ownerIdIndex.KeySchema.find(k => k.KeyType === 'HASH').AttributeName}`);
        } else {
            console.log('❌ OwnerIdIndex NOT FOUND!');
            console.log('⚠️  This will cause 500 errors when querying by owner');
            console.log('');
            console.log('FIX: Redeploy serverless.yml to create the GSI');
        }
        console.log('');

        // 3. Sample properties data
        console.log('3️⃣ Checking existing properties...');
        const scanResult = await dynamodb.scan({
            TableName: PROPERTIES_TABLE,
            Limit: 5
        }).promise();

        const properties = scanResult.Items || [];
        console.log(`📊 Total properties in table: ${scanResult.Count} (showing first 5)`);
        console.log('');

        if (properties.length === 0) {
            console.log('ℹ️  No properties in table yet');
        } else {
            let withOwnerId = 0;
            let withoutOwnerId = 0;

            properties.forEach((property, index) => {
                const hasOwnerId = !!property.ownerId;
                if (hasOwnerId) withOwnerId++;
                else withoutOwnerId++;

                console.log(`Property ${index + 1}:`);
                console.log(`  ID: ${property.propertyId}`);
                console.log(`  Name: ${property.propertyName || 'N/A'}`);
                console.log(`  Has ownerId: ${hasOwnerId ? '✅' : '❌'}`);
                if (hasOwnerId) {
                    console.log(`  ownerId: ${property.ownerId}`);
                    console.log(`  ownerIdIndex: ${property.ownerIdIndex || 'MISSING - needs migration!'}`);
                }
                console.log('');
            });

            console.log('SUMMARY:');
            console.log(`  Properties with ownerId: ${withOwnerId}`);
            console.log(`  Properties WITHOUT ownerId: ${withoutOwnerId}`);

            if (withoutOwnerId > 0) {
                console.log('');
                console.log('⚠️  ACTION REQUIRED:');
                console.log('   Run migration script: node scripts/migrate-property-ownerid.js');
            }
        }

        console.log('');
        console.log('='.repeat(60));
        console.log('✅ Verification complete');

    } catch (error) {
        console.error('');
        console.error('💥 VERIFICATION FAILED');
        console.error('Error:', error.message);

        if (error.code === 'ResourceNotFoundException') {
            console.error('');
            console.error('⚠️  Table does not exist!');
            console.error('FIX: Run `sls deploy` to create infrastructure');
        }

        throw error;
    }
}

// Run verification
if (require.main === module) {
    verifyDeployment()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { verifyDeployment };
