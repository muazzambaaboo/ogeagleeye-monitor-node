import { PayloadBuilder } from './payload.js';
import { Scanner, type ScannerOptions, type ScanResult } from './scanner.js';
import { FetchTransport } from './transport.js';
import type {
  HttpFailureRequest,
  InitOptions,
  SdkInfo,
  OGEagleEyeEvent,
  Transport,
} from './types.js';

const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_BATCH = 20;

export class Client {
  readonly endpoint: string;
  readonly ingestKey: string;

  private readonly sampleRate: number;
  private readonly debug: boolean;
  private readonly exitOnUncaught: boolean;
  private readonly maxBatchSize: number;
  private readonly transport: Transport;
  private readonly payloadBuilder: PayloadBuilder;

  private buffer: OGEagleEyeEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private handlersRegistered = false;
  private flushing = false;

  /** @deprecated Use endpoint. Kept for Loop 0 ClientOptions compatibility. */
  get dsn(): string {
    return this.endpoint;
  }

  constructor(options: InitOptions) {
    this.endpoint = (options.endpoint || '').replace(/\/+$/, '');
    this.ingestKey = options.key || '';
    this.sampleRate =
      options.sampleRate !== undefined ? Number(options.sampleRate) : 1.0;
    this.debug = Boolean(options.debug);
    this.exitOnUncaught =
      options.exitOnUncaught !== undefined ? Boolean(options.exitOnUncaught) : true;
    this.maxBatchSize =
      options.maxBatchSize !== undefined
        ? Math.max(1, Number(options.maxBatchSize))
        : DEFAULT_MAX_BATCH;

    const environment = options.environment || 'production';
    const appRoot = options.appRoot || process.cwd();

    this.payloadBuilder = new PayloadBuilder({
      environment,
      release: options.release ?? null,
      appRoot,
      sdkName: options.sdkName,
      sdkVersion: options.sdkVersion,
    });

    this.transport = options.transport ?? new FetchTransport(this.debug);

    const flushIntervalMs =
      options.flushIntervalMs !== undefined
        ? Math.max(0, Number(options.flushIntervalMs))
        : DEFAULT_FLUSH_INTERVAL_MS;

    if (flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, flushIntervalMs);
      // Allow process to exit even if timer is pending.
      if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
        this.flushTimer.unref();
      }
    }

    if (options.registerHandlers !== false) {
      this.registerHandlers();
    }

    process.once('beforeExit', () => {
      void this.flush();
    });
  }

  getSdkInfo(): SdkInfo {
    return this.payloadBuilder.getSdkInfo();
  }

  registerHandlers(): void {
    if (this.handlersRegistered) {
      return;
    }
    this.handlersRegistered = true;

    process.on('uncaughtException', (error) => {
      try {
        this.captureException(error);
        void this.flush().finally(() => {
          if (this.exitOnUncaught) {
            // Preserve crash semantics: attaching a listener suppresses Node's
            // default exit, so we exit explicitly after a best-effort flush.
            process.exitCode = 1;
            process.exit(1);
          }
        });
      } catch {
        if (this.exitOnUncaught) {
          process.exit(1);
        }
      }
    });

    process.on('unhandledRejection', (reason) => {
      try {
        this.captureException(
          reason instanceof Error ? reason : new Error(String(reason)),
          { unhandledRejection: true },
        );
        void this.flush();
      } catch {
        // never break the host
      }
      // Do not swallow: Node may still terminate depending on --unhandled-rejections.
      // We intentionally do not call process.exit here so existing app semantics remain.
    });
  }

  captureException(
    error: unknown,
    context: Record<string, unknown> = {},
  ): void {
    try {
      if (!this.shouldSample()) {
        return;
      }
      this.enqueue(this.payloadBuilder.forException(error, context));
    } catch (err) {
      this.debugLog(err instanceof Error ? err.message : String(err));
    }
  }

  captureMessage(
    message: string,
    level = 'error',
    context: Record<string, unknown> = {},
  ): void {
    try {
      if (!this.shouldSample()) {
        return;
      }
      this.enqueue(this.payloadBuilder.forMessage(message, level, context));
    } catch (err) {
      this.debugLog(err instanceof Error ? err.message : String(err));
    }
  }

  heartbeat(): void {
    try {
      this.enqueue(this.payloadBuilder.forHeartbeat());
    } catch (err) {
      this.debugLog(err instanceof Error ? err.message : String(err));
    }
  }

  captureHttpFailure(
    request: HttpFailureRequest,
    context: Record<string, unknown> = {},
  ): void {
    try {
      if (!this.shouldSample()) {
        return;
      }
      this.enqueue(this.payloadBuilder.forHttpFailure(request, context));
    } catch (err) {
      this.debugLog(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * File-integrity scan (manifest diff only — no PHP heuristics).
   * Buffers a scan_result event.
   */
  scan(
    paths: string[] | null = null,
    options: ScannerOptions & {
      context?: Record<string, unknown>;
      resetBaseline?: boolean;
    } = {},
  ): ScanResult | null {
    try {
      const { context = {}, resetBaseline = false, ...scannerOptions } =
        options;
      const scanner = new Scanner({
        root: scannerOptions.root ?? process.cwd(),
        ...scannerOptions,
      });
      const result = scanner.scan(paths, resetBaseline);
      this.enqueue(
        this.payloadBuilder.forScanResult(
          result as unknown as Record<string, unknown>,
          context,
        ),
      );
      return result;
    } catch (err) {
      this.debugLog(err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) {
      return;
    }
    this.flushing = true;
    try {
      const events = this.drainBuffer();
      await this.sendPayloads(events);
    } finally {
      this.flushing = false;
    }
  }

  drainBuffer(): OGEagleEyeEvent[] {
    const events = this.buffer;
    this.buffer = [];
    return events;
  }

  getBuffer(): OGEagleEyeEvent[] {
    return this.buffer;
  }

  getPayloadBuilder(): PayloadBuilder {
    return this.payloadBuilder;
  }

  getTransport(): Transport {
    return this.transport;
  }

  /** Stop the flush timer (tests / shutdown). */
  close(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private enqueue(payload: OGEagleEyeEvent): void {
    this.buffer.push(payload);
    if (this.buffer.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  private async sendPayloads(events: OGEagleEyeEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    if (!this.endpoint || !this.ingestKey) {
      return;
    }

    for (const payload of events) {
      try {
        await this.transport.send(this.endpoint, this.ingestKey, payload);
      } catch (err) {
        this.debugLog(err instanceof Error ? err.message : String(err));
      }
    }
  }

  private shouldSample(): boolean {
    if (this.sampleRate >= 1) {
      return true;
    }
    if (this.sampleRate <= 0) {
      return false;
    }
    return Math.random() <= this.sampleRate;
  }

  private debugLog(message: string): void {
    if (this.debug) {
      console.error(`[ogeagleeye/monitor-node] ${message}`);
    }
  }
}

let globalClient: Client | null = null;

export function init(options: InitOptions): Client {
  if (globalClient) {
    globalClient.close();
  }
  globalClient = new Client(options);
  return globalClient;
}

export function setClient(client: Client | null): void {
  if (globalClient && globalClient !== client) {
    globalClient.close();
  }
  globalClient = client;
}

export function getClient(): Client | null {
  return globalClient;
}

export function captureException(
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  globalClient?.captureException(error, context);
}

export function captureMessage(
  message: string,
  level = 'error',
  context: Record<string, unknown> = {},
): void {
  globalClient?.captureMessage(message, level, context);
}

export function heartbeat(): void {
  globalClient?.heartbeat();
}

export function captureHttpFailure(
  request: HttpFailureRequest,
  context: Record<string, unknown> = {},
): void {
  globalClient?.captureHttpFailure(request, context);
}

export function scan(
  paths: string[] | null = null,
  options: Parameters<Client['scan']>[1] = {},
): ReturnType<Client['scan']> {
  return globalClient?.scan(paths, options) ?? null;
}

export async function flush(): Promise<void> {
  await globalClient?.flush();
}
