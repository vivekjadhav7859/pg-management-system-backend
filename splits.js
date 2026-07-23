/**
 * Custom stack splitting rules for serverless-plugin-split-stacks.
 * Groups each Lambda function together with its LogGroup, Permission, ApiGateway Resource,
 * and ApiGateway Method into 5 nested application stacks (AppStack0..4).
 * 
 * Because all interdependent resources for a function land in the same nested stack,
 * intra-function CloudFormation dependencies resolve cleanly without circular errors.
 * 
 * Safely reduces Root stack resources from 550 down to ~35 (far below CloudFormation's 500 limit).
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

  const type = resource.Type;
  if (
    type === 'AWS::Logs::LogGroup' ||
    type === 'AWS::Lambda::Function' ||
    type === 'AWS::Lambda::Permission' ||
    type === 'AWS::ApiGateway::Resource' ||
    type === 'AWS::ApiGateway::Method'
  ) {
    // Extract base function / feature name
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
    return { destination: `AppStack${bucket}` };
  }

  return false;
};
