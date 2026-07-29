/**
 * cleanup-orphaned-appstack3.js
 *
 * Deletes orphaned AWS Lambda functions and CloudWatch Log Groups that were
 * left behind by a failed CloudFormation deployment across AppStack0, AppStack2
 * and AppStack3. These resources exist in AWS but are NOT tracked by
 * CloudFormation, causing "Resource name conflict" validation failures.
 *
 * Usage:
 *   node scripts/cleanup-orphaned-appstack3.js [--stage dev] [--dry-run] [--region ap-south-1]
 *
 * Options:
 *   --stage     Target stage (default: dev)
 *   --dry-run   List what would be deleted without actually deleting
 *   --region    AWS region (default: ap-south-1)
 */

// Uses aws-sdk v2 which is already in package.json dependencies
const AWS = require('aws-sdk');

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const stageIdx = args.indexOf('--stage');
const STAGE = stageIdx !== -1 ? args[stageIdx + 1] : 'dev';
const DRY_RUN = args.includes('--dry-run');
const regionIdx = args.indexOf('--region');
const REGION = regionIdx !== -1 ? args[regionIdx + 1] : 'ap-south-1';
const SERVICE = 'pg-management-backend';

AWS.config.update({ region: REGION });

// ── Orphaned function base names (all nested stacks) ─────────────────────────
// AppStack0 — Auth & Privacy (22 functions)
const APPSTACK0_FUNCTIONS = [
  'signup',
  'login',
  'refreshToken',
  'logout',
  'getLatestPolicies',
  'acceptPolicies',
  'getPolicyHistory',
  'forgotPassword',
  'confirmForgotPassword',
  'verifyEmail',
  'resendVerification',
  'verifyToken',
  'verifyInvitationToken',
  'activateAccount',
  'getProfile',
  'updateProfile',
  'getConsent',
  'updateConsent',
  'exportData',
  'requestErasure',
  'getAuditLogs',
  'createAdmin',
];

// AppStack2 — Tenant & Requests (21 functions)
const APPSTACK2_FUNCTIONS = [
  'inviteTenant',
  'checkInTenant',
  'resendInvitation',
  'getTenants',
  'getTenantById',
  'updateTenant',
  'checkOutTenant',
  'migrateTenant',
  'uploadKYC',
  'createBookingRequest',
  'signAgreement',
  'payRent',
  'createComplaint',
  'getComplaints',
  'updateComplaintStatus',
  'linkTenantProperty',
  'getTenantDashboard',
  'getRequests',
  'updateRequestStatus',
  'bulkApproveRequests',
  'bulkDeleteRequests',
];

// AppStack3 — Financial, Subscriptions & Notifications (29 functions)
// Included here for idempotency in case a re-run is needed after partial cleanup
const APPSTACK3_FUNCTIONS = [
  'addExpense',
  'broadcastEmail',
  'collectRent',
  'createSubscriptionCheckout',
  'deleteExpense',
  'deleteNotification',
  'deletePushSubscription',
  'generateReport',
  'getExpenses',
  'getNotificationLogs',
  'getNotifications',
  'getReminderSettings',
  'getRentPayments',
  'getSubscriptionStatus',
  'getVapidPublicKey',
  'globalSearch',
  'markAllNotificationsRead',
  'markNotificationRead',
  'markNotificationUnread',
  'razorpayPaymentWebhook',
  'savePushSubscription',
  'sendReminder',
  'sesEventHandler',
  'startSubscriptionTrial',
  'testSmtpCredentials',
  'updateExpense',
  'updatePayment',
  'updateReminderSettings',
  'verifySubscriptionCheckout',
];

const ALL_ORPHANED_FUNCTIONS = [
  ...APPSTACK0_FUNCTIONS,
  ...APPSTACK2_FUNCTIONS,
  ...APPSTACK3_FUNCTIONS,
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildFunctionName(fnName) {
  return `${SERVICE}-${STAGE}-${fnName}`;
}

function buildLogGroupName(fnName) {
  return `/aws/lambda/${buildFunctionName(fnName)}`;
}

const lambda = new AWS.Lambda();
const cloudwatchLogs = new AWS.CloudWatchLogs();

async function lambdaExists(functionName) {
  try {
    await lambda.getFunction({ FunctionName: functionName }).promise();
    return true;
  } catch (e) {
    if (e.code === 'ResourceNotFoundException') return false;
    throw e;
  }
}

async function logGroupExists(logGroupName) {
  const resp = await cloudwatchLogs
    .describeLogGroups({ logGroupNamePrefix: logGroupName })
    .promise();
  return (resp.logGroups || []).some((g) => g.logGroupName === logGroupName);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   All AppStacks Orphaned Resource Cleanup                ║');
  console.log('║   (AppStack0 + AppStack2 + AppStack3)                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Service  : ${SERVICE}`);
  console.log(`  Stage    : ${STAGE}`);
  console.log(`  Region   : ${REGION}`);
  console.log(`  Mode     : ${DRY_RUN ? 'DRY RUN (no deletions)' : 'LIVE (will delete)'}`);
  console.log(`  Functions: ${ALL_ORPHANED_FUNCTIONS.length} total across 3 stacks`);
  console.log('');

  if (DRY_RUN) {
    console.log('⚠️  DRY RUN mode — no resources will be deleted.\n');
  }

  let deletedFns = 0;
  let deletedLgs = 0;
  let skippedFns = 0;
  let skippedLgs = 0;

  const sections = [
    { label: 'AppStack0 (Auth & Privacy)', fns: APPSTACK0_FUNCTIONS },
    { label: 'AppStack2 (Tenant & Requests)', fns: APPSTACK2_FUNCTIONS },
    { label: 'AppStack3 (Financial & Notifications)', fns: APPSTACK3_FUNCTIONS },
  ];

  for (const { label, fns } of sections) {
    console.log(`\n── ${label} ─────────────────────────────────────────────────`);

    for (const fnName of fns) {
      const functionName = buildFunctionName(fnName);
      const logGroupName = buildLogGroupName(fnName);

      // ── Lambda Function ─────────────────────────────────────────────────────
      const fnExists = await lambdaExists(functionName);
      if (fnExists) {
        if (DRY_RUN) {
          console.log(`  [DRY RUN] Would delete Lambda:    ${functionName}`);
        } else {
          process.stdout.write(`  Deleting Lambda:    ${functionName} ... `);
          await lambda.deleteFunction({ FunctionName: functionName }).promise();
          console.log('✅');
          deletedFns++;
        }
      } else {
        console.log(`  [SKIP] Lambda (clean): ${functionName}`);
        skippedFns++;
      }

      // ── CloudWatch Log Group ────────────────────────────────────────────────
      const lgExists = await logGroupExists(logGroupName);
      if (lgExists) {
        if (DRY_RUN) {
          console.log(`  [DRY RUN] Would delete LogGroup:  ${logGroupName}`);
        } else {
          process.stdout.write(`  Deleting LogGroup:  ${logGroupName} ... `);
          await cloudwatchLogs.deleteLogGroup({ logGroupName }).promise();
          console.log('✅');
          deletedLgs++;
        }
      } else {
        console.log(`  [SKIP] LogGroup (clean): ${logGroupName}`);
        skippedLgs++;
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Cleanup Summary                                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (DRY_RUN) {
    console.log('  DRY RUN complete — no resources were deleted.');
    console.log('  Re-run without --dry-run to perform the actual cleanup.');
  } else {
    console.log(`  Lambda functions deleted : ${deletedFns}`);
    console.log(`  Lambda functions skipped : ${skippedFns} (already clean)`);
    console.log(`  Log groups deleted       : ${deletedLgs}`);
    console.log(`  Log groups skipped       : ${skippedLgs} (already clean)`);
    console.log('');
    if (deletedFns > 0 || deletedLgs > 0) {
      console.log('✅ Orphaned resources cleaned up successfully.');
      console.log('');
      console.log('Next step:');
      console.log('  serverless deploy --stage dev --verbose');
    } else {
      console.log('ℹ️  No orphaned resources found — environment is already clean.');
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Cleanup failed:', err.message);
  if (err.code) console.error('   AWS Error Code:', err.code);
  process.exit(1);
});
