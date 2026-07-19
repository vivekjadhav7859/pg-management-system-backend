<!--
title: 'AWS Simple HTTP Endpoint example in NodeJS'
description: 'This template demonstrates how to make a simple HTTP API with Node.js running on AWS Lambda and API Gateway using the Serverless Framework.'
layout: Doc
framework: v4
platform: AWS
language: nodeJS
authorLink: 'https://github.com/serverless'
authorName: 'Serverless, Inc.'
authorAvatar: 'https://avatars1.githubusercontent.com/u/13742415?s=200&v=4'
-->

# Serverless Framework Node HTTP API on AWS

This template demonstrates how to make a simple HTTP API with Node.js running on AWS Lambda and API Gateway using the Serverless Framework.

This template does not include any kind of persistence (database). For more advanced examples, check out the [serverless/examples repository](https://github.com/serverless/examples/) which includes Typescript, Mongo, DynamoDB and other examples.

## Usage

### Deployment

In order to deploy the example, you need to run the following command:

```
serverless deploy
```

After running deploy, you should see output similar to:

```
Deploying "serverless-http-api" to stage "dev" (us-east-1)

✔ Service deployed to stack serverless-http-api-dev (91s)

endpoint: GET - https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/
functions:
  hello: serverless-http-api-dev-hello (1.6 kB)
```

_Note_: In current form, after deployment, your API is public and can be invoked by anyone. For production deployments, you might want to configure an authorizer. For details on how to do that, refer to [HTTP API (API Gateway V2) event docs](https://www.serverless.com/framework/docs/providers/aws/events/http-api).

### Invocation

After successful deployment, you can call the created application via HTTP:

```
curl https://xxxxxxx.execute-api.us-east-1.amazonaws.com/
```

Which should result in response similar to:

```json
{ "message": "Go Serverless v4! Your function executed successfully!" }
```

### Local development

The easiest way to develop and test your function is to use the `dev` command:

```
serverless dev
```

This will start a local emulator of AWS Lambda and tunnel your requests to and from AWS Lambda, allowing you to interact with your function as if it were running in the cloud.

Now you can invoke the function as before, but this time the function will be executed locally. Now you can develop your function locally, invoke it, and see the results immediately without having to re-deploy.

When you are done developing, don't forget to run `serverless deploy` to deploy the function to the cloud.

## Razorpay owner subscriptions

The owner SaaS uses Razorpay Subscriptions, not one-time Orders. Before deployment:

1. Create one yearly Razorpay Plan for each tier: Basic, Silver, Gold and Platinum. Use `period=yearly` and `interval=1`.
2. Copy `.env.example` to the stage's secure deployment environment and set the four Plan IDs and matching amounts in paise.
3. Store `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in the deployment secret store. Never commit them or expose them to the frontend.
4. Configure this webhook URL in Razorpay for all `subscription.*` events:

   `https://<api-id>.execute-api.ap-south-1.amazonaws.com/<stage>/subscriptions/webhook`

5. At minimum enable `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.updated`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.paused`, `subscription.resumed` and `subscription.completed`.
6. Test the complete flow with Razorpay test keys and test Plan IDs before switching the production deployment to live credentials.

The amount configured in the environment is checked against the Razorpay Plan before checkout. A mismatch fails closed instead of displaying one amount and charging another.

Current product decisions encoded by this implementation:

- The 30-day trial is once per owner account and begins when management is explicitly activated or the first valid management write is made. A trial can add or activate only one managed property; migrated owners keep access to existing properties but cannot add more during the trial.
- Owners may authorize an annual Razorpay plan during the trial. Its paid property limit and first annual charge begin only when the trial ends.
- Pricing is annual-only: Basic ₹2,999, Silver ₹4,999, Gold ₹7,999 and Platinum ₹11,999 per year. Environment amounts are stored in paise.
- Basic supports 1 managed property, Silver 2, Gold 5, and Platinum 10. Owners with 6–10 properties use Platinum; more than 10 requires an Enterprise arrangement.
- Discovery-only properties use `managementEnabled: false`; their creation and listing edits are never paywalled.
- Expired, cancelled, halted, paused and over-limit accounts retain all reads but management writes are blocked with HTTP 402.

### Grant the launch trial to existing owners

The migration script is idempotent and defaults to dry-run. It selects active owners created before the migration cutoff who already have at least one managed property. Discovery-only owners are excluded, and any owner with an existing trial or subscription record is skipped.

Preview the `dev` migration without writing anything:

```bash
npm run subscriptions:grant-existing-trials -- --stage dev
```

Apply after reviewing the counts:

```bash
npm run subscriptions:grant-existing-trials -- --stage dev --apply
```

Production requires an explicit second acknowledgement:

```bash
npm run subscriptions:grant-existing-trials -- --stage prod --apply --confirm-prod
```

Use `--starts-at` and `--created-before` with ISO timestamps when the launch time must be fixed. Run `npm run subscriptions:grant-existing-trials -- --help` for every option.
