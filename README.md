# @ogeagleeye/monitor-node

Node.js SDK for the [OGEagleEye](https://github.com/muazzambaaboo/ogeagleeye-platform) monitoring platform.

Works with plain Node and Express. Reports exceptions, messages, heartbeats, and optional file scans to your OGEagleEye ingest API.

| | |
|---|---|
| **Package** | `@ogeagleeye/monitor-node` |
| **Node** | ≥ 18 |
| **Module** | ESM + CJS (`dist/`) |
| **Platform** | [ogeagleeye-platform](https://github.com/muazzambaaboo/ogeagleeye-platform) |

Related:

- [`ogeagleeye/monitor-php`](https://github.com/muazzambaaboo/ogeagleeye-monitor-php)
- [`ogeagleeye/monitor-laravel`](https://github.com/muazzambaaboo/ogeagleeye-monitor-laravel)

Version: see [VERSION](VERSION) / [CHANGELOG.md](CHANGELOG.md). Current npm `version` field: see [package.json](package.json).

---

## What it is

- TypeScript SDK compiled to dual ESM/CJS
- `init()` configures transport to `POST /api/v1/events`
- Helpers: `captureException`, `captureMessage`, `heartbeat`, `scan`, `flush`
- Express helpers: `requestHandler()`, `ogEagleEyeErrorHandler()`

---

## Install

### npm (when published)

```bash
npm install @ogeagleeye/monitor-node
```

### From GitHub

```bash
npm install github:muazzambaaboo/ogeagleeye-monitor-node#master
```

### Local path

```bash
npm install ../ogeagleeye-monitor-node
# or in package.json: "file:../ogeagleeye-monitor-node"
```

Build once if using a fresh clone:

```bash
cd ogeagleeye-monitor-node
npm install
npm run build
```

---

## Setup

1. Panel → **Projects → Create** (platform = **Node**) → copy `oge_…`.
2. Set environment variables:

```bash
export OGEAGLEEYE_KEY=oge_YOUR_KEY
export OGEAGLEEYE_ENDPOINT=https://monitor.example.com/api/v1/events
```

---

## How to use

### Plain Node

```js
import {
  init,
  captureException,
  captureMessage,
  heartbeat,
  scan,
  flush,
} from '@ogeagleeye/monitor-node';

init({
  key: process.env.OGEAGLEEYE_KEY,
  endpoint: process.env.OGEAGLEEYE_ENDPOINT || 'https://monitor.example.com/api/v1/events',
  environment: process.env.NODE_ENV || 'production',
  release: process.env.APP_VERSION,
});

try {
  risky();
} catch (err) {
  captureException(err, { order_id: 123 });
  await flush();
}

captureMessage('Something noteworthy', 'warning');
heartbeat();
scan(['src', 'public']);
await flush();
```

### Express

```js
import express from 'express';
import {
  init,
  requestHandler,
  ogEagleEyeErrorHandler,
} from '@ogeagleeye/monitor-node';

init({
  key: process.env.OGEAGLEEYE_KEY,
  endpoint: process.env.OGEAGLEEYE_ENDPOINT,
});

const app = express();
app.use(requestHandler());

app.get('/boom', () => {
  throw new Error('express boom');
});

app.use(ogEagleEyeErrorHandler());
app.listen(3000);
```

### API overview

| Export | Purpose |
|--------|---------|
| `init(options)` | Configure client |
| `captureException(err, context?)` | Buffer error event |
| `captureMessage(msg, level?)` | Buffer log event |
| `heartbeat()` | Buffer heartbeat |
| `scan(paths?, options?)` | Integrity / heuristics scan |
| `flush()` | Send buffer (async) |
| `requestHandler()` | Express request middleware |
| `ogEagleEyeErrorHandler()` | Express error middleware |

---

## Demo

See [`examples/demo-node-app`](examples/demo-node-app) (`file:../..` dependency).

```bash
cd examples/demo-node-app
npm install
OGEAGLEEYE_KEY=oge_... OGEAGLEEYE_ENDPOINT=http://platform.test/api/v1/events npm start
```

---

## Build / test

```bash
npm install
npm run build
npm test
```

---

## Docs

- [docs/quickstart-node.md](docs/quickstart-node.md)
- [docs/sdk-integration-node.md](docs/sdk-integration-node.md)
- [docs/scanning.md](docs/scanning.md)
- [docs/event-schema-v1.md](docs/event-schema-v1.md)

---

## License

MIT — see [LICENSE](LICENSE) if present.
