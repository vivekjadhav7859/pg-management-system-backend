/**
 * Custom stack splitting rules for serverless-plugin-split-stacks.
 * Groups Lambda functions and their dependent resources (LogGroups, Permissions,
 * ApiGateway Resources, and ApiGateway Methods) into 5 nested application stacks (AppStack0..4).
 * 
 * Preserves CloudFormation compatibility for existing API Gateway resources in deployed stages,
 * while keeping Root-level triggers (Cognito, Event Rules, DynamoDB Streams), Authorizers, RestApi,
 * IAM Roles, DynamoDB, Cognito, S3, and KMS in Root.
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

function getFeatureBucket(fnName) {
  const name = fnName.toLowerCase();
  // Auth & Admin -> AppStack0
  if (
    name.includes('signup') ||
    name.includes('login') ||
    name.includes('refresh') ||
    name.includes('logout') ||
    name.includes('password') ||
    name.includes('verify') ||
    name.includes('profile') ||
    name.includes('admin') ||
    name.includes('activate')
  ) {
    return 0;
  }
  // Property & Room & Upload & Invite -> AppStack1
  if (
    name.includes('property') ||
    name.includes('properties') ||
    name.includes('room') ||
    name.includes('rooms') ||
    name.includes('image') ||
    name.includes('invitecode') ||
    name.includes('public')
  ) {
    return 1;
  }
  // Tenant & Request & Complaint -> AppStack2
  if (
    name.includes('tenant') ||
    name.includes('kyc') ||
    name.includes('booking') ||
    name.includes('agreement') ||
    name.includes('request') ||
    name.includes('complaint')
  ) {
    return 2;
  }
  // Financial & Subscription & Notification & Search -> AppStack3
  return 3;
}

module.exports = function (resource, logicalId) {
  // Keep Authorizer, RestApi, Deployment, IAM Roles, DynamoDB, Cognito, S3, KMS, and Custom Resources in root
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

  // Keep Root-level triggers/custom resources in Root
  if (
    resource.Type === 'AWS::Events::Rule' ||
    resource.Type === 'AWS::Lambda::EventSourceMapping' ||
    resource.Type.startsWith('Custom::')
  ) {
    ejectFromNestedStack(this, logicalId);
    return false;
  }

  // Extract function name associated with this resource
  let fnName = null;

  if (logicalId.endsWith('LambdaFunction')) {
    fnName = logicalId.replace(/LambdaFunction$/, '');
  } else if (logicalId.endsWith('LogGroup')) {
    fnName = logicalId.replace(/LogGroup$/, '');
  } else if (resource.Type === 'AWS::Lambda::Permission') {
    if (resource.Properties && resource.Properties.FunctionName) {
      const fn = resource.Properties.FunctionName;
      if (fn.Ref) {
        fnName = fn.Ref.replace(/LambdaFunction$/, '');
      } else if (fn['Fn::GetAtt'] && Array.isArray(fn['Fn::GetAtt'])) {
        fnName = fn['Fn::GetAtt'][0].replace(/LambdaFunction$/, '');
      }
    }
  } else if (resource.Type === 'AWS::ApiGateway::Method') {
    const integration = resource.Properties && resource.Properties.Integration;
    if (integration && integration.Uri) {
      const uriStr = JSON.stringify(integration.Uri);
      const match = uriStr.match(/([A-Za-z0-9]+LambdaFunction)/);
      if (match) {
        fnName = match[1].replace(/LambdaFunction$/, '');
      }
    }
  }

  // If matched to a Lambda function:
  if (fnName) {
    // Keep non-HTTP / root-triggered functions & custom resource lambdas in Root to prevent Root <-> AppStack cycles
    if (rootFunctions.has(fnName.toLowerCase()) || fnName.toLowerCase().includes('custom')) {
      ejectFromNestedStack(this, logicalId);
      return false;
    }

    let hash = 0;
    for (let i = 0; i < fnName.length; i++) {
      hash = (hash * 31 + fnName.charCodeAt(i)) >>> 0;
    }
    const bucket = hash % 5;
    return { destination: `AppStack${bucket}`, force: true };
  }

  // For ApiGateway Resources, LogGroups, Permissions, or Methods:
  // Distribute into 5 AppStack buckets using baseName hashing to preserve CloudFormation stack placement compatibility
  const type = resource.Type;
  if (
    type === 'AWS::Logs::LogGroup' ||
    type === 'AWS::Lambda::Function' ||
    type === 'AWS::Lambda::Permission' ||
    type === 'AWS::ApiGateway::Resource' ||
    type === 'AWS::ApiGateway::Method'
  ) {
    let baseName = logicalId
      .replace(/^ApiGatewayResource/, '')
      .replace(/^ApiGatewayMethod/, '')
      .replace(/LogGroup$/, '')
      .replace(/LambdaFunction$/, '')
      .replace(/LambdaPermission.*$/, '')
      .replace(/Options$/, '')
      .replace(/Post$/, '')
      .replace(/Get$/, '')
      .replace(/Put$/, '')
      .replace(/Delete$/, '');

    let hash = 0;
    for (let i = 0; i < baseName.length; i++) {
      hash = (hash * 31 + baseName.charCodeAt(i)) >>> 0;
    }
    const bucket = hash % 5;
    return { destination: `AppStack${bucket}`, force: true };
  }

  ejectFromNestedStack(this, logicalId);
  return false;
};











