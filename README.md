# @ogeagleeye/monitor-node

Node.js SDK for OGEagleEye (Node 18+). Ask your **system admin** for:

- **Ingest key** (`oge_…`)
- **Events endpoint** (e.g. `https://your-host/api/v1/events`)

## Requirements

- Node.js 18+

## Install

```bash
npm install @ogeagleeye/monitor-node
```

Package: [npmjs.com/package/@ogeagleeye/monitor-node](https://www.npmjs.com/package/@ogeagleeye/monitor-node)
## Setup

1. Get the **ingest key** and **endpoint** from your system admin.
2. Call `init()` as early as possible (before your server starts handling traffic):

```js
import { init } from '@ogeagleeye/monitor-node';

init({
  key: 'oge_YOUR_KEY_FROM_ADMIN',
  endpoint: 'https://your-host/api/v1/events',
  environment: 'production', // optional
});
```

Or via environment variables:

```bash
OGEAGLEEYE_KEY=oge_YOUR_KEY_FROM_ADMIN
OGEAGLEEYE_ENDPOINT=https://your-host/api/v1/events
```

```js
import { init } from '@ogeagleeye/monitor-node';

init({
  key: process.env.OGEAGLEEYE_KEY,
  endpoint: process.env.OGEAGLEEYE_ENDPOINT,
});
```

### Express (optional)

```js
import express from 'express';
import { init, requestHandler, ogEagleEyeErrorHandler } from '@ogeagleeye/monitor-node';

init({
  key: process.env.OGEAGLEEYE_KEY,
  endpoint: process.env.OGEAGLEEYE_ENDPOINT,
});

const app = express();
app.use(requestHandler());
// ... routes ...
app.use(ogEagleEyeErrorHandler());
```

That is enough for basic error reporting.

## Heartbeat

Heartbeats are **opt-in**. Error reporting does **not** send them. Until this app sends heartbeats, the OGEagleEye panel shows **Heartbeat: none**.

```js
import { init, heartbeat, flush } from '@ogeagleeye/monitor-node';

init({
  key: process.env.OGEAGLEEYE_KEY,
  endpoint: process.env.OGEAGLEEYE_ENDPOINT,
});

heartbeat();
await flush();
```

Schedule that on **this** host (for example every minute via cron) so the platform can detect a silent outage.

## Scanning

Scans run **on this app’s server** (not on the OGEagleEye platform). The SDK checks local files, then POSTs a `scan_result` to your endpoint. The platform stores Scan reports and can alert on critical findings.

This is an integrity helper — **not** an antivirus (Node has no PHP heuristics).

```js
import { init, scan, flush } from '@ogeagleeye/monitor-node';

init({
  key: process.env.OGEAGLEEYE_KEY,
  endpoint: process.env.OGEAGLEEYE_ENDPOINT,
});

scan(['src', 'public'], { root: process.cwd() });
await flush();
```

Run it from cron / a scheduled job on **this** host (for example daily). More detail: [docs/scanning.md](docs/scanning.md).
