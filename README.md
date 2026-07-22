# @ogeagleeye/monitor-node

Node.js SDK for OGEagleEye (Node 18+). Ask your **system admin** for:

- **Ingest key** (`oge_…`)
- **Events endpoint** (e.g. `https://your-host/api/v1/events`)

## Requirements

- Node.js 18+

## Install

```bash
npm install github:muazzambaaboo/ogeagleeye-monitor-node#master
```

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
