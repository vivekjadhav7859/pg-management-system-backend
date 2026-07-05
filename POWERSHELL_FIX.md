# PowerShell Alias Fix for Serverless

## Problem
PowerShell has `sls` aliased to `Select-String`, preventing the Serverless CLI from working.

## Quick Fix - Use `serverless` or `npx serverless` instead

Instead of:
```powershell
sls deploy
```

Use one of these:
```powershell
# Option 1: Use full command
serverless deploy

# Option 2: Use npx
npx serverless deploy

# Option 3: Use npm script
npm run deploy:dev
```

## Permanent Fix - Remove PowerShell Alias

Add this to your PowerShell profile to remove the conflicting alias:

```powershell
# Open PowerShell profile
notepad $PROFILE

# Add this line:
Remove-Item Alias:sls -Force -ErrorAction SilentlyContinue

# Save and reload
. $PROFILE
```

## Verify Fix
```powershell
# Check if sls works
serverless --version
```

## For This Project

Use the npm scripts instead:
```powershell
npm run deploy:dev    # Deploy to dev
npm run deploy:qa     # Deploy to QA
npm run deploy:prod   # Deploy to production
```
