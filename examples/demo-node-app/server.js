/**
 * Minimal Express demo for @ogeagleeye/monitor-node.
 *
 * Env: OGEAGLEEYE_KEY, OGEAGLEEYE_ENDPOINT (default http://platform.test/api/v1/events)
 * Routes: GET /boom → 500 error, GET /slow → slow 200, GET /ok → 200
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  init,
  requestHandler,
  ogEagleEyeErrorHandler,
} from '@ogeagleeye/monitor-node';

const __dirname = dirname(fileURLToPath(import.meta.url));
const key = process.env.OGEAGLEEYE_KEY || '';
const endpoint =
  process.env.OGEAGLEEYE_ENDPOINT || 'http://platform.test/api/v1/events';

if (!key) {
  console.error('Set OGEAGLEEYE_KEY to a project ingest key.');
  process.exit(1);
}

init({
  key,
  endpoint,
  environment: 'local',
  release: 'demo-node-0.1.0',
  appRoot: __dirname,
  registerHandlers: false,
});

const app = express();
app.use(requestHandler({ slowThresholdMs: 500 }));

app.get('/ok', (_req, res) => {
  res.json({ ok: true });
});

app.get('/slow', async (_req, res) => {
  await new Promise((r) => setTimeout(r, 800));
  res.json({ ok: true, slow: true });
});

app.get('/boom', () => {
  throw new Error('Demo boom from examples/demo-node-app');
});

app.use(ogEagleEyeErrorHandler());
app.use((err, _req, res, _next) => {
  res.status(500).json({ message: err.message });
});

const port = Number(process.env.PORT || 3456);
app.listen(port, () => {
  console.log(`demo-node-app listening on http://127.0.0.1:${port}`);
});
