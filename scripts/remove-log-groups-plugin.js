/**
 * RemoveLogGroupsPlugin
 * 
 * Serverless Framework plugin that:
 * 1. Strips all explicit AWS::Logs::LogGroup resources from compiled CloudFormation templates.
 * 2. Cleans up DependsOn references to deleted LogGroup logical IDs.
 * 3. Strips fixed physical FunctionName properties from nested application Lambda functions
 *    to allow CloudFormation to auto-name functions in nested stacks, resolving cross-stack migration deadlocks.
 * 4. PRESERVES fixed FunctionName properties for Root-level functions and Custom Resources
 *    (e.g., CustomDashresourceDashexistingDashcupLambdaFunction, Cognito triggers, Authorizer)
 *    so CloudFormation Custom Resource ServiceTokens remain static ("Modifying service token is not allowed").
 * 5. Cleans up empty Policy properties ("Policy": "") on ApiGatewayRestApi resources.
 * 6. Renames logical ID ApiGatewayRestApi -> ApiGatewayRestApiV2 to force CloudFormation to provision
 *    a brand new REST API resource rather than trying to call UpdateRestApi on a deleted physical REST API ID.
 */
const rootFunctionKeys = new Set([
  'CognitoPreSignUpLambdaFunction',
  'CognitoCustomMessageLambdaFunction',
  'GenerateMonthlyBillsLambdaFunction',
  'OnTenantCreatedLambdaFunction',
  'ScheduledRentReminderLambdaFunction',
  'AuthorizerLambdaFunction',
]);

class RemoveLogGroupsPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.hooks = {
      'before:aws:package:finalize:mergeCustomProviderResources': this.cleanTemplate.bind(this),
      'aws:package:finalize:mergeCustomProviderResources': this.cleanTemplate.bind(this),
    };
  }

  cleanTemplate() {
    const provider = this.serverless.service.provider;
    if (provider && provider.compiledCloudFormationTemplate && provider.compiledCloudFormationTemplate.Resources) {
      let templateStr = JSON.stringify(provider.compiledCloudFormationTemplate);

      // 1. Rename ApiGatewayRestApi -> ApiGatewayRestApiV2 across the entire template
      if (provider.compiledCloudFormationTemplate.Resources.ApiGatewayRestApi) {
        templateStr = templateStr
          .replace(/"ApiGatewayRestApi"/g, '"ApiGatewayRestApiV2"')
          .replace(/"Ref":"ApiGatewayRestApi"/g, '"Ref":"ApiGatewayRestApiV2"');
        provider.compiledCloudFormationTemplate = JSON.parse(templateStr);
        this.serverless.cli.log('[RemoveLogGroupsPlugin] Renamed ApiGatewayRestApi -> ApiGatewayRestApiV2 to force new REST API resource creation.');
      }

      const resources = provider.compiledCloudFormationTemplate.Resources;
      const deletedLogGroupKeys = new Set();
      let fnCount = 0;

      Object.keys(resources).forEach((key) => {
        const res = resources[key];
        if (res.Type === 'AWS::Logs::LogGroup') {
          deletedLogGroupKeys.add(key);
          delete resources[key];
        } else if (res.Type === 'AWS::Lambda::Function') {
          // Do NOT strip FunctionName from Root functions or Custom Resources
          const isCustomResource =
            key.startsWith('Custom') ||
            key.startsWith('CustomResource') ||
            key.startsWith('CustomDashresource');
          const isRootFunction = rootFunctionKeys.has(key);

          if (!isCustomResource && !isRootFunction) {
            if (res.Properties && res.Properties.FunctionName) {
              delete res.Properties.FunctionName;
              fnCount++;
            }
          }
        } else if (res.Type === 'AWS::ApiGateway::RestApi' && res.Properties) {
          if (res.Properties.Policy === '' || res.Properties.Policy === null || (Array.isArray(res.Properties.Policy) && res.Properties.Policy.length === 0)) {
            delete res.Properties.Policy;
          }
        }
      });

      // Clean up DependsOn references in remaining resources
      if (deletedLogGroupKeys.size > 0) {
        Object.keys(resources).forEach((key) => {
          const res = resources[key];
          if (res.DependsOn) {
            if (Array.isArray(res.DependsOn)) {
              res.DependsOn = res.DependsOn.filter((dep) => !deletedLogGroupKeys.has(dep));
              if (res.DependsOn.length === 0) {
                delete res.DependsOn;
              }
            } else if (typeof res.DependsOn === 'string') {
              if (deletedLogGroupKeys.has(res.DependsOn)) {
                delete res.DependsOn;
              }
            }
          }
        });
      }

      this.serverless.cli.log(
        `[RemoveLogGroupsPlugin] Stripped ${deletedLogGroupKeys.size} AWS::Logs::LogGroup resources, removed fixed FunctionName from ${fnCount} nested functions, cleaned up empty RestApi Policy, and cleaned up DependsOn references.`
      );
    }
  }
}

module.exports = RemoveLogGroupsPlugin;
