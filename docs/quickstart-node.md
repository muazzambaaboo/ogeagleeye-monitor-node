# Quickstart — Node SDK

Copy-paste path from an empty directory. Target: **< 10 minutes**.

## 1. Project key

Panel → **Projects → Create** (platform = Node) → copy `oge_…`.

## 2. Install

```bash
mkdir demo-node && cd demo-node
npm init -y
npm install @ogeagleeye/monitor-node
```

Local sibling / pre-registry:

```bash
npm install ../ogeagleeye-monitor-node
```

## 3. `crash.mjs`

```js
import { init, flush } from '@ogeagleeye/monitor-node';

init({
  key: process.env.OGEAGLEEYE_KEY || 'oge_YOUR_KEY',
  endpoint: process.env.OGEAGLEEYE_ENDPOINT || 'http://platform.test/api/v1/events',
  environment: 'local',
});

throw new Error('Quickstart Node boom');
```

## 4. Run

```bash
set OGEAGLEEYE_KEY=oge_YOUR_KEY
set OGEAGLEEYE_ENDPOINT=http://platform.test/api/v1/events
node crash.mjs
```

Drain ingest → panel Issues shows `Error: Quickstart Node boom`.

## Express (optional)

```js
import express from 'express';
import { init, requestHandler, ogEagleEyeErrorHandler } from '@ogeagleeye/monitor-node';

init({ key: process.env.OGEAGLEEYE_KEY, endpoint: process.env.OGEAGLEEYE_ENDPOINT });

const app = express();
app.use(requestHandler());
app.get('/boom', () => { throw new Error('express boom'); });
app.use(ogEagleEyeErrorHandler());
app.listen(3000);
```

See: [sdk-integration-node.md](sdk-integration-node.md).
