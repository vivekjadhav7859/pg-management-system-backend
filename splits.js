/**
 * Custom stack splitting rules for serverless-plugin-split-stacks.
 * Groups HTTP Lambda functions, LogGroups, Permissions, ApiGateway Resources,
 * and ApiGateway Methods into 4 domain-isolated nested application stacks (AppStack0..3).
 * 
 * AppStack0: Auth & Admin (/auth/*, /admin/*)
 * AppStack1: Property, Room, Public Invites & Image Uploads (/properties/*, /rooms/*, /invite-code/*, /upload/*)
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
  
  // 1. Auth & Admin -> AppStack0
  if (name.includes('auth') || name.includes('admin')) {
    return 0;
  }
  
  // 2. Tenants, Tenant, Requests, Complaints, KYC, Booking, Agreement -> AppStack2
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

  // 3. Property, Rooms, Upload, Invite-code -> AppStack1
  if (
    name.includes('properties') ||
    name.includes('property') ||
    name.includes('rooms') ||
    name.includes('room') ||
    name.includes('upload') ||
    name.includes('invite')
  ) {
    return 1;
  }
  
  // 4. Financial, Subscriptions, Notifications, Search -> AppStack3
  return 3;
}

module.exports = function (resource, logicalId) {
  // Keep Authorizer, RestApi, Deployment, ApiGateway Resources & Methods, IAM Roles, DynamoDB, Cognito, S3, KMS in root
  // keeping ApiGateway resources in Root prevents cross-stack circular dependencies between nested stacks and ApiGatewayDeployment.
  if (
    logicalId.startsWith('Authorizer') ||
    logicalId.startsWith('ApiGateway') ||
    logicalId.startsWith('IamRole') ||
    logicalId.startsWith('Custom') ||
    logicalId.startsWith('CustomResource') ||
    logicalId.startsWith('CustomDashresource') ||
    resource.Type === 'AWS::ApiGateway::Resource' ||
    resource.Type === 'AWS::ApiGateway::Method' ||
    resource.Type === 'AWS::ApiGateway::RestApi' ||
    resource.Type === 'AWS::ApiGateway::Deployment' ||
    resource.Type === 'AWS::ApiGateway::Authorizer'
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
