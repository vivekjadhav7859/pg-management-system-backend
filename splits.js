/**
 * Custom stack splitting rules for serverless-plugin-split-stacks.
 * Groups HTTP Lambda functions together with their LogGroups, Permissions,
 * and ApiGateway Methods into 5 nested application stacks (AppStack0..4).
 * 
 * Keep ApiGateway Resources in Root to avoid parent-child cross-nested-stack cycles.
 * Keep non-HTTP / root-triggered functions (Cognito triggers, Event Rules, Event Source Mappings)
 * in Root to avoid Root <-> Nested Stack circular dependency loops.
 * Keep Authorizer, RestApi, Deployment, IAM Roles, DynamoDB, Cognito, S3, KMS in root.
 */

// List of Lambda functions triggered by Root-level resources (Cognito, Event Rules, DynamoDB Streams)
const rootFunctions = new Set([
  'cognitopresignup',
  'cognitocustommessage',
  'generatemonthlybills',
  'ontenantcreated',
  'scheduledrentreminder'
]);

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
    return false;
  }

  // Keep ApiGateway Resources in Root to prevent cross-stack parent-child dependency loops
  if (resource.Type === 'AWS::ApiGateway::Resource') {
    return false;
  }

  // Keep Root-level triggers/custom resources in Root
  if (
    resource.Type === 'AWS::Events::Rule' ||
    resource.Type === 'AWS::Lambda::EventSourceMapping' ||
    resource.Type.startsWith('Custom::')
  ) {
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
      return false;
    }

    let hash = 0;
    for (let i = 0; i < fnName.length; i++) {
      hash = (hash * 31 + fnName.charCodeAt(i)) >>> 0;
    }
    const bucket = hash % 5;
    return { destination: `AppStack${bucket}`, force: true };
  }

  // For OPTIONS methods or other function-related resources without a direct Lambda function target,
  // distribute into AppStack buckets using logicalId hashing to keep Root stack small (~140 resources).
  const type = resource.Type;
  if (
    type === 'AWS::Logs::LogGroup' ||
    type === 'AWS::Lambda::Function' ||
    type === 'AWS::Lambda::Permission' ||
    type === 'AWS::ApiGateway::Method'
  ) {
    let hash = 0;
    for (let i = 0; i < logicalId.length; i++) {
      hash = (hash * 31 + logicalId.charCodeAt(i)) >>> 0;
    }
    const bucket = hash % 5;
    return { destination: `AppStack${bucket}`, force: true };
  }

  return false;
};






