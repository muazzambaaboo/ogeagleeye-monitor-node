import type { OGEagleEyeEvent, Transport } from './types.js';

const DEFAULT_TIMEOUT_MS = 2000;

export class FetchTransport implements Transport {
  private readonly debug: boolean;
  private readonly timeoutMs: number;

  constructor(debug = false, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.debug = debug;
    this.timeoutMs = timeoutMs;
  }

  async send(
    endpoint: string,
    ingestKey: string,
    payload: OGEagleEyeEvent,
  ): Promise<void> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-OGEagleEye-Key': ingestKey,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      this.debugLog(err instanceof Error ? err.message : String(err));
    }
  }

  private debugLog(message: string): void {
    if (this.debug) {
      console.error(`[ogeagleeye/monitor-node] ${message}`);
    }
  }
}
