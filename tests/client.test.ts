import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  Client,
  init,
  setClient,
  captureException,
  captureMessage,
  heartbeat,
  flush,
  scrub,
  hash,
  parseStack,
  PayloadBuilder,
} from '../src/index.js';
import type { OGEagleEyeEvent, Transport } from '../src/index.js';

function memoryTransport(sent: OGEagleEyeEvent[]): Transport {
  return {
    async send(_endpoint, _key, payload) {
      sent.push(payload);
    },
  };
}

describe('scrubbing', () => {
  it('filters sensitive keys and hashes ip/email', () => {
    const out = scrub({
      password: 'secret',
      api_token: 'abc',
      Authorization: 'Bearer x',
      email: 'user@example.com',
      ip: '1.2.3.4',
      nested: { cookie: 'sid=1', ok: true },
    }) as Record<string, unknown>;

    expect(out.password).toBe('[Filtered]');
    expect(out.api_token).toBe('[Filtered]');
    expect(out.Authorization).toBe('[Filtered]');
    expect(out.email).toBe(hash('user@example.com'));
    expect(out.ip).toBe(hash('1.2.3.4'));
    expect((out.nested as Record<string, unknown>).cookie).toBe('[Filtered]');
    expect((out.nested as Record<string, unknown>).ok).toBe(true);
  });
});

describe('stack parsing', () => {
  it('marks app frames in_app and node_modules as not', () => {
    const err = new Error('boom');
    err.stack = [
      'Error: boom',
      `    at boom (${process.cwd().replace(/\\/g, '/')}/src/app.ts:10:5)`,
      '    at Object.<anonymous> (/usr/lib/node_modules/foo/index.js:1:1)',
      '    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
    ].join('\n');

    const frames = parseStack(err, process.cwd());
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(frames[0]?.in_app).toBe(true);
    expect(frames[0]?.file).toContain('src/app.ts');
    expect(frames[0]?.line).toBe(10);
    expect(frames[0]?.function).toBe('boom');

    const nm = frames.find((f) => f.file.includes('node_modules') || f.file.includes('foo'));
    if (nm) {
      expect(nm.in_app).toBe(false);
    }
  });
});

describe('payload builder', () => {
  it('builds schema-v1 error payloads', () => {
    const builder = new PayloadBuilder({
      environment: 'test',
      release: '0.1.0',
      appRoot: process.cwd(),
    });
    const payload = builder.forException(new Error('fail'), {
      order_id: 1,
      tags: { server: 'web-01' },
      user: { id: '42', email: 'a@b.c' },
    });

    expect(payload.schema_version).toBe(1);
    expect(payload.event_type).toBe('error');
    expect(payload.event_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(payload.environment).toBe('test');
    expect(payload.release).toBe('0.1.0');
    expect(payload.sdk).toEqual({ name: 'monitor-node', version: '0.2.0' });
    expect(payload.exception?.class).toBe('Error');
    expect(payload.exception?.message).toBe('fail');
    expect(payload.exception?.frames.length).toBeGreaterThan(0);
    expect(payload.tags).toEqual({ server: 'web-01' });
    expect(payload.user?.id).toBe('42');
    expect(payload.user?.email_hash).toBe(hash('a@b.c'));
    expect(payload.context?.order_id).toBe(1);
    expect(payload.context?.user).toBeUndefined();
    expect(payload.context?.tags).toBeUndefined();
  });

  it('builds heartbeat and http_failure payloads', () => {
    const builder = new PayloadBuilder({
      environment: 'prod',
      appRoot: process.cwd(),
    });
    expect(builder.forHeartbeat().event_type).toBe('heartbeat');

    const http = builder.forHttpFailure({
      url: '/api/orders',
      method: 'POST',
      status_code: 500,
      duration_ms: 1200.6,
      ip: '10.0.0.1',
    });
    expect(http.event_type).toBe('http_failure');
    expect(http.request).toEqual({
      url: '/api/orders',
      method: 'POST',
      status_code: 500,
      duration_ms: 1201,
      ip_hash: hash('10.0.0.1'),
    });
  });

  it('truncates oversized context', () => {
    const builder = new PayloadBuilder({
      environment: 'test',
      appRoot: process.cwd(),
    });
    const big = 'x'.repeat(9000);
    const payload = builder.forMessage('hi', 'info', { blob: big });
    expect(payload.context?._truncated).toBe(true);
  });
});

describe('Client batching + sampling', () => {
  let sent: OGEagleEyeEvent[];

  beforeEach(() => {
    sent = [];
    setClient(null);
  });

  afterEach(() => {
    setClient(null);
  });

  it('buffers events and flushes via transport', async () => {
    const client = new Client({
      key: 'oge_test',
      endpoint: 'http://example.test/api/v1/events',
      environment: 'test',
      registerHandlers: false,
      flushIntervalMs: 0,
      transport: memoryTransport(sent),
    });

    client.captureException(new Error('one'));
    client.captureMessage('two', 'warning');
    client.heartbeat();
    expect(client.getBuffer()).toHaveLength(3);

    await client.flush();
    expect(client.getBuffer()).toHaveLength(0);
    expect(sent).toHaveLength(3);
    expect(sent.map((e) => e.event_type)).toEqual(['error', 'log', 'heartbeat']);
    client.close();
  });

  it('auto-flushes when batch size reached', async () => {
    const client = new Client({
      key: 'oge_test',
      endpoint: 'http://example.test/api/v1/events',
      registerHandlers: false,
      flushIntervalMs: 0,
      maxBatchSize: 2,
      transport: memoryTransport(sent),
    });

    client.captureMessage('a');
    expect(sent).toHaveLength(0);
    client.captureMessage('b');
    // flush is async
    await vi.waitFor(() => expect(sent.length).toBe(2));
    client.close();
  });

  it('respects sample_rate 0', async () => {
    const client = new Client({
      key: 'oge_test',
      endpoint: 'http://example.test/api/v1/events',
      sampleRate: 0,
      registerHandlers: false,
      flushIntervalMs: 0,
      transport: memoryTransport(sent),
    });
    client.captureException(new Error('nope'));
    client.heartbeat();
    await client.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.event_type).toBe('heartbeat');
    client.close();
  });

  it('module-level init helpers work', async () => {
    init({
      key: 'oge_test',
      endpoint: 'http://example.test/api/v1/events',
      registerHandlers: false,
      flushIntervalMs: 0,
      transport: memoryTransport(sent),
    });
    captureException(new Error('via facade'));
    captureMessage('msg');
    heartbeat();
    await flush();
    expect(sent.length).toBe(3);
    setClient(null);
  });

  it('transport failures are silent', async () => {
    const client = new Client({
      key: 'oge_test',
      endpoint: 'http://example.test/api/v1/events',
      registerHandlers: false,
      flushIntervalMs: 0,
      transport: {
        async send() {
          throw new Error('network down');
        },
      },
    });
    client.captureMessage('x');
    await expect(client.flush()).resolves.toBeUndefined();
    client.close();
  });

  it('returns sdk info', () => {
    const client = new Client({
      key: 'oge_key',
      endpoint: 'https://ogeagleeye.example/api/v1/events/',
      registerHandlers: false,
      flushIntervalMs: 0,
    });
    expect(client.endpoint).toBe('https://ogeagleeye.example/api/v1/events');
    expect(client.getSdkInfo()).toEqual({
      name: 'monitor-node',
      version: '0.2.0',
    });
    client.close();
  });
});
