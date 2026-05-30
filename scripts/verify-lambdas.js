#!/usr/bin/env node
/**
 * verify-lambdas.js
 *
 * Post-deploy safety net. Checks every Lambda's code size.
 * If any function has a suspiciously small package (< 50 KB),
 * it means the zip is broken (895-byte bug) and re-uploads the
 * correct bundle from the local .serverless build output.
 *
 * Usage:
 *   node scripts/verify-lambdas.js [--stage dev|qa|prod] [--fix]
 *
 * --fix   Automatically re-upload broken Lambdas (default: true)
 * --stage Stage to check (default: dev)
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const stage = args.includes('--stage') ? args[args.indexOf('--stage') + 1] : 'dev';
const autoFix = !args.includes('--no-fix');
const region = 'ap-south-1';
const service = 'pg-management-backend';

// All 36 functions
const FUNCTIONS = [
  // auth
  { name: 'signup',           src: 'src/functions/auth/signup.js' },
  { name: 'login',            src: 'src/functions/auth/login.js' },
  { name: 'refreshToken',     src: 'src/functions/auth/refreshToken.js' },
  { name: 'logout',           src: 'src/functions/auth/logout.js' },
  { name: 'verifyToken',      src: 'src/functions/auth/verifyToken.js' },
  { name: 'getProfile',       src: 'src/functions/auth/getProfile.js' },
  { name: 'updateProfile',    src: 'src/functions/auth/updateProfile.js' },
  { name: 'createAdmin',      src: 'src/functions/auth/createAdmin.js' },
  // property
  { name: 'addProperty',      src: 'src/functions/property/addProperty.js' },
  { name: 'getProperties',    src: 'src/functions/property/getProperties.js' },
  { name: 'getPropertyById',  src: 'src/functions/property/getPropertyById.js' },
  { name: 'updateProperty',   src: 'src/functions/property/updateProperty.js' },
  { name: 'deleteProperty',   src: 'src/functions/property/deleteProperty.js' },
  { name: 'addRoom',          src: 'src/functions/property/addRoom.js' },
  { name: 'getRooms',         src: 'src/functions/property/getRooms.js' },
  { name: 'getRoomById',      src: 'src/functions/property/getRoomById.js' },
  { name: 'updateRoom',       src: 'src/functions/property/updateRoom.js' },
  { name: 'deleteRoom',       src: 'src/functions/property/deleteRoom.js' },
  // tenant
  { name: 'checkInTenant',    src: 'src/functions/tenant/checkInTenant.js' },
  { name: 'getTenants',       src: 'src/functions/tenant/getTenants.js' },
  { name: 'getTenantById',    src: 'src/functions/tenant/getTenantById.js' },
  { name: 'updateTenant',     src: 'src/functions/tenant/updateTenant.js' },
  { name: 'checkOutTenant',   src: 'src/functions/tenant/checkOutTenant.js' },
  { name: 'uploadKYC',        src: 'src/functions/tenant/uploadKYC.js' },
  { name: 'getRoomStatus',    src: 'src/functions/tenant/getRoomStatus.js' },
  // financial
  { name: 'collectRent',          src: 'src/functions/financial/collectRent.js' },
  { name: 'getRentPayments',      src: 'src/functions/financial/getRentPayments.js' },
  { name: 'updatePayment',        src: 'src/functions/financial/updatePayment.js' },
  { name: 'addExpense',           src: 'src/functions/financial/addExpense.js' },
  { name: 'getExpenses',          src: 'src/functions/financial/getExpenses.js' },
  { name: 'updateExpense',        src: 'src/functions/financial/updateExpense.js' },
  { name: 'deleteExpense',        src: 'src/functions/financial/deleteExpense.js' },
  { name: 'generateReport',       src: 'src/functions/financial/generateReport.js' },
  { name: 'sendReminder',         src: 'src/functions/financial/sendReminder.js' },
  { name: 'getReminderSettings',  src: 'src/functions/financial/getReminderSettings.js' },
  { name: 'updateReminderSettings', src: 'src/functions/financial/updateReminderSettings.js' },
];

const MIN_HEALTHY_BYTES = 50_000; // 50 KB — broken zips are ~895 bytes

function awsCli(args) {
  const result = spawnSync('aws', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  return result.stdout.trim();
}

function getLambdaCodeSize(functionName) {
  try {
    const out = awsCli([
      'lambda', 'get-function-configuration',
      '--function-name', functionName,
      '--region', region,
      '--query', 'CodeSize',
      '--output', 'text',
    ]);
    return parseInt(out, 10);
  } catch {
    return -1;
  }
}

function resolveBuiltFile(fn) {
  const buildDir = path.join(__dirname, '..', '.serverless', 'build');
  const fromPackage = path.join(buildDir, fn.src);
  if (fs.existsSync(fromPackage)) {
    return fromPackage;
  }

  const sourceEntry = path.join(__dirname, '..', fn.src);
  if (!fs.existsSync(sourceEntry)) {
    console.error(`  ✗ Source not found: ${sourceEntry}`);
    return null;
  }

  const tmpOut = path.join(os.tmpdir(), `pg-lambda-${fn.name}-${Date.now()}`);
  fs.mkdirSync(path.dirname(path.join(tmpOut, fn.src)), { recursive: true });
  const bundledOut = path.join(tmpOut, fn.src);

  console.log(`  📦 Bundling ${fn.name} with esbuild...`);
  try {
    require('esbuild').buildSync({
      entryPoints: [sourceEntry],
      bundle: true,
      minify: true,
      platform: 'node',
      target: 'node20',
      outfile: bundledOut,
      packages: 'bundle',
    });
  } catch (err) {
    console.error(`  ✗ esbuild failed: ${err.message}`);
    return null;
  }

  return bundledOut;
}

function buildZipForFunction(fn) {
  const builtFile = resolveBuiltFile(fn);
  if (!builtFile) {
    return null;
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), `pg-zip-${fn.name}-`));
  const destHandler = path.join(stagingDir, fn.src);
  fs.mkdirSync(path.dirname(destHandler), { recursive: true });
  fs.copyFileSync(builtFile, destHandler);

  const root = path.join(__dirname, '..');
  for (const meta of ['package.json', 'package-lock.json']) {
    const src = path.join(root, meta);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(stagingDir, meta));
    }
  }

  const zipPath = path.join(__dirname, '..', '.serverless', `fix-${fn.name}.zip`);
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const tarResult = spawnSync(
    'tar',
    ['-a', '-cf', zipPath, '-C', stagingDir, '.'],
    { encoding: 'utf8' }
  );
  if (tarResult.status !== 0) {
    console.error(`  ✗ Failed to create zip: ${tarResult.stderr}`);
    return null;
  }

  try {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  return zipPath;
}

function fixLambda(fn, lambdaName) {
  console.log(`  🔧 Fixing ${lambdaName}...`);
  const zipPath = buildZipForFunction(fn);
  if (!zipPath) return false;

  const result = spawnSync('aws', [
    'lambda', 'update-function-code',
    '--function-name', lambdaName,
    '--zip-file', `fileb://${zipPath}`,
    '--region', region,
    '--query', 'CodeSize',
    '--output', 'text',
  ], { encoding: 'utf8' });

  if (result.error || result.status !== 0) {
    console.error(`  ✗ AWS CLI error: ${result.stderr}`);
    return false;
  }

  const newSize = parseInt(result.stdout.trim(), 10);
  console.log(`  ✅ Fixed! New code size: ${(newSize / 1024).toFixed(0)} KB`);

  // Clean up temp zip
  try { fs.unlinkSync(zipPath); } catch {}
  return true;
}

async function main() {
  console.log(`\n🔍 Verifying Lambda code sizes for stage: ${stage}\n`);

  const broken = [];
  const healthy = [];

  for (const fn of FUNCTIONS) {
    const lambdaName = `${service}-${stage}-${fn.name}`;
    const size = getLambdaCodeSize(lambdaName);

    if (size < 0) {
      console.log(`  ⚠️  ${fn.name}: NOT FOUND (skipping)`);
    } else if (size < MIN_HEALTHY_BYTES) {
      console.log(`  ❌ ${fn.name}: ${size} bytes — BROKEN`);
      broken.push(fn);
    } else {
      console.log(`  ✅ ${fn.name}: ${(size / 1024).toFixed(0)} KB`);
      healthy.push(fn);
    }
  }

  console.log(`\n📊 Summary: ${healthy.length} healthy, ${broken.length} broken\n`);

  if (broken.length === 0) {
    console.log('🎉 All Lambdas are healthy!\n');
    process.exit(0);
  }

  if (!autoFix) {
    console.log('⚠️  Broken Lambdas found. Run with --fix to auto-repair.\n');
    process.exit(1);
  }

  console.log(`🔧 Auto-fixing ${broken.length} broken Lambda(s)...\n`);
  let fixed = 0;
  for (const fn of broken) {
    const lambdaName = `${service}-${stage}-${fn.name}`;
    const ok = fixLambda(fn, lambdaName);
    if (ok) fixed++;
  }

  console.log(`\n✅ Fixed ${fixed}/${broken.length} Lambdas.\n`);
  process.exit(fixed === broken.length ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
