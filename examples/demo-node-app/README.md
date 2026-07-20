# demo-node-app

Throwaway Node app for dogfooding `@ogeagleeye/monitor-node` against a local OGEagleEye platform.

## Setup

```powershell
# From the package root — build the SDK first
npm install
npm run build

cd examples\demo-node-app
npm install
```

Create a project with platform `node` in the panel (or use the seeded **Demo Node App**) and copy its ingest key.

```powershell
$env:OGEAGLEEYE_KEY = "oge_..."
$env:OGEAGLEEYE_ENDPOINT = "http://platform.test/api/v1/events"
```

## Crash script

```powershell
node crash.js
# platform down resilience:
node crash.js --down   # must exit 0 in < 3s
```

Then drain the ingest queue on the platform (`php artisan queue:work redis --queue=ingest --once`) and confirm a new issue appears.

## Express server

```powershell
npm run server
# GET /boom  → error event
# GET /slow  → http_failure (duration)
# GET /ok    → quiet
```
