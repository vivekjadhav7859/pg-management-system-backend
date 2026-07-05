# Backend Utility Scripts

This directory contains utility scripts for managing the PG Management System backend.

## Available Scripts

### 1. Verify Deployment
Checks if your backend is properly configured and deployed.

```powershell
npm run verify
```

**What it checks:**
- ✅ Properties table exists in DynamoDB
- ✅ OwnerIdIndex GSI is configured
- ✅ Existing properties have required fields
- ✅ Shows sample property data

### 2. Migrate Property Ownership
Adds `ownerId` field to all existing properties in DynamoDB.

```powershell
npm run migrate
```

**What it does:**
- Scans all properties
- Adds `ownerId` to properties missing it
- Adds `ownerIdIndex` for GSI queries
- Shows migration summary

**⚠️ Important:** The script will assign all properties to user ID `a1a3ad7a-3091-70e5-5f96-cada940a25cd`. Edit the script if you need a different owner.

## Environment Variables

Both scripts use these environment variables:

```powershell
# Required
$env:PROPERTY_TABLE = "pg-management-backend-properties-dev"
$env:AWS_PROFILE = "default"  # Your AWS profile name
$env:AWS_REGION = "ap-south-1"
```

## Troubleshooting

### "Table not found" Error
Run `sls deploy` to create the infrastructure first.

### "AccessDenied" Error
Ensure your AWS credentials have DynamoDB permissions:
- `dynamodb:Scan`
- `dynamodb:UpdateItem`
- `dynamodb:DescribeTable`

### "Index not found" Error
Redeploy serverless.yml to create the OwnerIdIndex GSI:
```powershell
sls deploy
```

## When to Use These Scripts

**Use `npm run verify` when:**
- After deploying to a new environment
- Debugging 500 errors
- Checking data integrity
- Before running migration

**Use `npm run migrate` when:**
- Existing properties don't have `ownerId`
- After adding security features
- One-time data migration
- Testing with legacy data

## Next Steps After Migration

1. ✅ Verify migration completed successfully
2. ✅ Redeploy Lambda functions: `sls deploy`
3. ✅ Test GET /properties endpoint
4. ✅ Test POST /properties endpoint
5. ✅ Verify properties are isolated by user

## Support

For issues or questions, refer to the debugging guide in the artifacts directory.
