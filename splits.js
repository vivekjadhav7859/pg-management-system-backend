/**
 * Custom stack splitting rules for serverless-plugin-split-stacks.
 * Groups HTTP Lambda functions, LogGroups, Permissions into 4 domain-isolated nested application stacks (AppStack0..3),
 * while grouping ALL ApiGateway Resources and Methods into AppStack1 to prevent cross-stack parent-child route dependencies.
 * 
 * AppStack0: Auth & Admin (/auth/*, /admin/*, /privacy/*, /consent/*)
 * AppStack1: All ApiGateway Resources & Methods, plus Property, Room, Public Invites & Image Uploads (/properties/*, /rooms/*, /invite-code/*, /upload/*)
 * AppStack2: Tenant, Booking, Agreement, Requests & Complaints (/tenants/*, /tenant/*, /requests/*, /complaints/*, /kyc/*, /booking/*, /agreement/*)
 * AppStack3: Financial, Subscriptions, Search & Notifications (/subscriptions/*, /rent/*, /expenses/*, /notifications/*, /search/*, /financial/*)
 * 
 * Keep Authorizer, RestApi, Deployment, IAM Roles, DynamoDB, Cognito, S3, KMS, Custom Resources,
 * and pure non-HTTP background functions in Root.
 */

// List of Lambda functions triggered by Root-level resources (Cognito, Event Rules, DynamoDB Streams)
const rootFunctions = new Set([
  'cognitopresignup',
  'cognitocustommessage',
  'generatemonthlybills',
  'ontenantcreated',
  'scheduledrentreminder'
]);

function ejectFromNestedStack(context, logicalId) {
  if (context && context.plugin && context.plugin.resourceMigrations && context.plugin.resourceMigrations[logicalId]) {
    const migration = context.plugin.resourceMigrations[logicalId];
    if (migration.stack && migration.stack.Resources) {
      delete migration.stack.Resources[logicalId];
    }
    delete context.plugin.resourceMigrations[logicalId];
  }
}

function getDomainBucket(logicalId) {
  const name = logicalId.toLowerCase();
  
  // 1. Property, Rooms, Image Uploads, Public Property Invites & Join Requests -> AppStack1
  if (
    name.includes('invite') ||
    name.includes('publicjoin') ||
    name.includes('properties') ||
    name.includes('property') ||
    name.includes('rooms') ||
    name.includes('room') ||
    name.includes('upload')
  ) {
    return 1;
  }

  // 2. Auth, User Profile, Admin, Account Verification, Privacy, Consent, Audit Logs -> AppStack0
  if (
    name.includes('auth') ||
    name.includes('admin') ||
    name.includes('signup') ||
    name.includes('login') ||
    name.includes('logout') ||
    name.includes('profile') ||
    name.includes('password') ||
    name.includes('verification') ||
    name.includes('verify') ||
    name.includes('email') ||
    name.includes('token') ||
    name.includes('policy') ||
    name.includes('consent') ||
    name.includes('privacy') ||
    name.includes('audit') ||
    name.includes('exportdata') ||
    name.includes('erasure') ||
    name.includes('activateaccount')
  ) {
    return 0;
  }
  
  // 3. Tenants, Tenant Management, Booking Requests, Agreements, Complaints -> AppStack2
  if (
    name.includes('tenants') ||
    name.includes('tenant') ||
    name.includes('requests') ||
    name.includes('request') ||
    name.includes('complaint') ||
    name.includes('kyc') ||
    name.includes('booking') ||
    name.includes('agreement')
  ) {
    return 2;
  }

  // 4. Financial, Subscriptions, Payments, Expenses, Notifications, Search -> AppStack3
  return 3;
}

module.exports = function (resource, logicalId) {
  // Keep Authorizer, RestApi, Deployment, IAM Roles, DynamoDB, Cognito, S3, KMS in root
  if (
    logicalId.startsWith('Authorizer') ||
    logicalId.startsWith('ApiGatewayRestApi') ||
    logicalId.startsWith('ApiGatewayDeployment') ||
    logicalId.startsWith('IamRole') ||
    logicalId.startsWith('Custom') ||
    logicalId.startsWith('CustomResource') ||
    logicalId.startsWith('CustomDashresource')
  ) {
    ejectFromNestedStack(this, logicalId);
    return false;
  }

  // Extract baseName for function / resource matching
  let baseName = logicalId
    .replace(/LogGroup$/, '')
    .replace(/LambdaFunction$/, '')
    .replace(/LambdaPermission.*$/, '')
    .replace(/EventsRuleSchedule.*$/, '')
    .replace(/EventSourceMapping.*$/, '');

  const lowerBase = baseName.toLowerCase();
  const lowerLogical = logicalId.toLowerCase();

  // Keep Root-level triggered functions and their associated resources (EventsRules, EventSourceMappings) in Root
  if (
    rootFunctions.has(lowerBase) ||
    rootFunctions.has(lowerLogical) ||
    lowerBase.includes('cognitopresignup') ||
    lowerBase.includes('cognitocustommessage') ||
    lowerBase.includes('ontenantcreated') ||
    lowerBase.includes('scheduledrentreminder') ||
    lowerBase.includes('generatemonthlybills') ||
    lowerLogical.includes('cognito') ||
    resource.Type === 'AWS::Lambda::EventSourceMapping' ||
    resource.Type.startsWith('Custom::')
  ) {
    ejectFromNestedStack(this, logicalId);
    return false;
  }

  const type = resource.Type;

  // Place ALL ApiGateway Resources and Methods into AppStack1 so parent-child path hierarchies stay together
  if (type === 'AWS::ApiGateway::Resource' || type === 'AWS::ApiGateway::Method') {
    return { destination: 'AppStack1', force: true };
  }

  if (
    type === 'AWS::Logs::LogGroup' ||
    type === 'AWS::Lambda::Function' ||
    type === 'AWS::Lambda::Permission' ||
    type === 'AWS::Events::Rule'
  ) {
    const bucket = getDomainBucket(logicalId);
    return { destination: `AppStack${bucket}`, force: true };
  }

  ejectFromNestedStack(this, logicalId);
  return false;
};
