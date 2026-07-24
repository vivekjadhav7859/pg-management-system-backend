/**
 * Custom stack splitting rules for serverless-plugin-split-stacks.
 * Groups each Lambda function together with its LogGroup, Permission,
 * and ApiGateway Method into 5 nested application stacks (AppStack0..4).
 * 
 * Keep ApiGateway Resources in Root to avoid parent-child cross-nested-stack cycles.
 * Keep Authorizer, RestApi, Deployment, IAM Roles, DynamoDB, Cognito, S3, KMS in root.
 */
module.exports = function (resource, logicalId) {
  // Keep Authorizer, RestApi, Deployment, IAM Roles, DynamoDB, Cognito, S3, KMS in root
  if (
    logicalId.startsWith('Authorizer') ||
    logicalId.startsWith('ApiGatewayRestApi') ||
    logicalId.startsWith('ApiGatewayDeployment') ||
    logicalId.startsWith('IamRole')
  ) {
    return false;
  }

  // Keep ApiGateway Resources in Root to prevent cross-stack parent-child dependency loops
  if (resource.Type === 'AWS::ApiGateway::Resource') {
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

  // If matched to a Lambda function, assign function & its dependent resources to the same AppStack bucket
  if (fnName) {
    let hash = 0;
    for (let i = 0; i < fnName.length; i++) {
      hash = (hash * 31 + fnName.charCodeAt(i)) >>> 0;
    }
    const bucket = hash % 5;
    return { destination: `AppStack${bucket}` };
  }

  // For OPTIONS methods or other function-related resources without a direct Lambda function target,
  // distribute into AppStack buckets using logicalId hashing to keep Root stack small (~125 resources).
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
    return { destination: `AppStack${bucket}` };
  }

  return false;
};


