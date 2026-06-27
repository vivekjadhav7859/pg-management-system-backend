/**
 * Prune old Lambda versions, keeping the N most recent per function.
 * Run after deploy: node scripts/prune-lambda-versions.js dev 3
 */
const AWS = require('aws-sdk');

const stage = process.argv[2] || 'dev';
const keepCount = parseInt(process.argv[3] || '3', 10);
const service = 'pg-management-backend';
const region = process.env.AWS_REGION || 'ap-south-1';

const lambda = new AWS.Lambda({ region });

async function pruneFunction(functionName) {
  const { Versions = [] } = await lambda
    .listVersionsByFunction({ FunctionName: functionName })
    .promise();

  const numericVersions = Versions.filter((v) => v.Version !== '$LATEST')
    .sort((a, b) => Number(b.Version) - Number(a.Version));

  const toDelete = numericVersions.slice(keepCount);
  for (const version of toDelete) {
    await lambda
      .deleteFunction({
        FunctionName: functionName,
        Qualifier: version.Version,
      })
      .promise();
    console.log(`Deleted ${functionName}:${version.Version}`);
  }
}

async function main() {
  const prefix = `${service}-${stage}-`;
  let marker;
  let pruned = 0;

  do {
    const res = await lambda
      .listFunctions({ Marker: marker, MaxItems: 50 })
      .promise();

    for (const fn of res.Functions || []) {
      if (fn.FunctionName.startsWith(prefix)) {
        await pruneFunction(fn.FunctionName);
        pruned++;
      }
    }
    marker = res.NextMarker;
  } while (marker);

  console.log(`Prune complete. Processed ${pruned} functions (kept ${keepCount} versions each).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
