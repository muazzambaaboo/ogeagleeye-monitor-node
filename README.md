# @ogeagleeye/monitor-node

Node.js SDK for the OGEagleEye monitoring platform. Targets **Node 18+** (plain Node + Express).

Version: see [VERSION](VERSION) / [CHANGELOG.md](CHANGELOG.md).

## Install

```bash
npm install @ogeagleeye/monitor-node
```

Local sibling / pre-registry:

```bash
npm install ../ogeagleeye-monitor-node
# or from the demo: file:../..
```

## Quick start

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
  endpoint: process.env.OGEAGLEEYE_ENDPOINT || 'https://your-host/api/v1/events',
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

## Docs

- [docs/quickstart-node.md](docs/quickstart-node.md)
- [docs/sdk-integration-node.md](docs/sdk-integration-node.md)
- [docs/scanning.md](docs/scanning.md)
- [docs/event-schema-v1.md](docs/event-schema-v1.md)

## Demo

See [`examples/demo-node-app`](examples/demo-node-app).

## Build / test

```bash
npm install
npm run build
npm test
```
