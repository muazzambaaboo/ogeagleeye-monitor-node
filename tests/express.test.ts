import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  init,
  setClient,
  requestHandler,
  ogEagleEyeErrorHandler,
} from '../src/index.js';
import type { OGEagleEyeEvent, Transport } from '../src/index.js';

function memoryTransport(sent: OGEagleEyeEvent[]): Transport {
  return {
    async send(_endpoint, _key, payload) {
      sent.push(payload);
    },
  };
}

describe('Express adapter', () => {
  let sent: OGEagleEyeEvent[];

  beforeEach(() => {
    sent = [];
    setClient(null);
    init({
      key: 'oge_test',
      endpoint: 'http://example.test/api/v1/events',
      environment: 'test',
      registerHandlers: false,
      flushIntervalMs: 0,
      transport: memoryTransport(sent),
    });
  });

  afterEach(() => {
    setClient(null);
  });

  it('captures 5xx via requestHandler', async () => {
    const app = express();
    app.use(requestHandler({ slowThresholdMs: 0 }));
    app.get('/fail', (_req, res) => {
      res.status(500).json({ ok: false });
    });

    await request(app).get('/fail').expect(500);
    await viWait(sent, 1);

    expect(sent[0]?.event_type).toBe('http_failure');
    expect(sent[0]?.request?.status_code).toBe(500);
    expect(sent[0]?.request?.method).toBe('GET');
  });

  it('captures slow requests', async () => {
    const app = express();
    app.use(requestHandler({ slowThresholdMs: 50 }));
    app.get('/slow', async (_req, res) => {
      await new Promise((r) => setTimeout(r, 80));
      res.status(200).json({ ok: true });
    });

    await request(app).get('/slow').expect(200);
    await viWait(sent, 1);

    expect(sent[0]?.event_type).toBe('http_failure');
    expect(sent[0]?.request?.status_code).toBe(200);
    expect((sent[0]?.request?.duration_ms ?? 0) >= 50).toBe(true);
  });

  it('ogEagleEyeErrorHandler captures thrown errors', async () => {
    const app = express();
    app.get('/boom', () => {
      throw new Error('express boom');
    });
    app.use(ogEagleEyeErrorHandler());
    // Express default error handler after ours
    app.use(
      (
        err: Error,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res.status(500).json({ message: err.message });
      },
    );

    await request(app).get('/boom').expect(500);
    await viWait(sent, 1);

    expect(sent[0]?.event_type).toBe('error');
    expect(sent[0]?.exception?.message).toBe('express boom');
  });
});

async function viWait(sent: OGEagleEyeEvent[], min: number, ms = 1000): Promise<void> {
  const start = Date.now();
  while (sent.length < min) {
    if (Date.now() - start > ms) {
      throw new Error(`timed out waiting for ${min} events, got ${sent.length}`);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}
