# Recent fixes

## Tenants API 502 (fixed)

**Cause:** `serverless.yml` referenced `src/functions/tenant/getTenants.handler`, but the file was named `gettenants.js`. AWS Lambda runs on Linux (case-sensitive), so the handler failed with:

`Cannot find module 'getTenants'`

**Fix:** Renamed handler file to `getTenants.js`.

## Lambda version pruning

- **serverless-prune-plugin** — keeps **5** published versions per function after each deploy (`custom.prune` in `serverless.yml`).
- **scripts/prune-lambda-versions.js** — manual fallback: `npm run prune:dev`

## Deploy

Push to `dev` (GitHub Actions) or run locally with Serverless license:

```bash
export SERVERLESS_ACCESS_KEY=your-key
npm run deploy:dev
```
