# SDK Integration — Node.js

Install `@ogeagleeye/monitor-node` in any **Node 18+** application (plain or Express).

```bash
npm install @ogeagleeye/monitor-node
```

```js
import { init, captureException, flush } from '@ogeagleeye/monitor-node';

init({
  key: process.env.OGEAGLEEYE_KEY,
  endpoint: process.env.OGEAGLEEYE_ENDPOINT || 'https://your-host/api/v1/events',
  environment: process.env.NODE_ENV || 'production',
  release: process.env.APP_VERSION,
});

// Uncaught exceptions / unhandled rejections are captured automatically.
// Optional manual capture:
try {
  throw new Error('example');
} catch (err) {
  captureException(err);
  await flush();
}
```

## Express

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
app.use(requestHandler()); // 5xx + slow requests → http_failure

// ... routes ...

app.use(ogEagleEyeErrorHandler());
```

Events conform to [event-schema-v1](event-schema-v1.md). See the package README for scrubbing, batching, and handler exit semantics.
