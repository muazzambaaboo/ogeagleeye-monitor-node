/**
 * Demo crash script for @ogeagleeye/monitor-node.
 *
 * Env:
 *   OGEAGLEEYE_KEY      Project ingest key (oge_...)
 *   OGEAGLEEYE_ENDPOINT Full ingest URL (default http://platform.test/api/v1/events)
 *
 * Usage:
 *   node crash.js
 *   node crash.js --down   # point at a closed port to prove SDK never blocks
 */

import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { init, captureException, flush } from '@ogeagleeye/monitor-node';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const down = args.includes('--down');

let endpoint =
  process.env.OGEAGLEEYE_ENDPOINT || 'http://platform.test/api/v1/events';
let key = process.env.OGEAGLEEYE_KEY || '';

if (down) {
  endpoint = 'http://127.0.0.1:9/api/v1/events';
  if (!key) {
    key = 'oge_platform_down_resilience_test';
  }
}

if (!key) {
  console.error('Set OGEAGLEEYE_KEY to a project ingest key (or pass --down).');
  process.exit(1);
}

const started = performance.now();

init({
  key,
  endpoint,
  environment: 'local',
  release: 'demo-node-0.1.0',
  appRoot: __dirname,
  registerHandlers: false,
  flushIntervalMs: 0,
  debug: false,
});

try {
  throw new Error('Demo crash from examples/demo-node-app');
} catch (err) {
  captureException(err, {
    demo: true,
    script: 'crash.js',
  });
  await flush();
}

const elapsed = (performance.now() - started) / 1000;
console.log(
  `ok exit=0 elapsed=${elapsed.toFixed(3)}s endpoint=${endpoint}`,
);
process.exit(0);
