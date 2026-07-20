import type { IncomingMessage, ServerResponse } from 'node:http';
import { captureException, captureHttpFailure, flush, getClient } from './client.js';

export type ExpressLikeRequest = IncomingMessage & {
  method?: string;
  originalUrl?: string;
  url?: string;
  route?: { path?: string };
  ip?: string;
  socket?: { remoteAddress?: string };
};

export type ExpressLikeResponse = ServerResponse & {
  statusCode: number;
  locals?: Record<string, unknown>;
};

export type ExpressNext = (err?: unknown) => void;

export type RequestHandlerOptions = {
  /** Capture responses with status >= 500 (always). */
  /** Opt-in capture of 4xx responses (default false). */
  capture4xx?: boolean;
  /** Capture requests slower than this many ms (default 2000). Set 0 to disable. */
  slowThresholdMs?: number;
};

/**
 * Express request middleware: records start time and on `finish` reports
 * http_failure for 5xx (and optional 4xx / slow requests).
 */
export function requestHandler(options: RequestHandlerOptions = {}) {
  const capture4xx = Boolean(options.capture4xx);
  const slowThresholdMs =
    options.slowThresholdMs !== undefined
      ? Number(options.slowThresholdMs)
      : 2000;

  return function ogEagleEyeRequestHandler(
    req: ExpressLikeRequest,
    res: ExpressLikeResponse,
    next: ExpressNext,
  ): void {
    const started = Date.now();

    res.on('finish', () => {
      try {
        const client = getClient();
        if (!client) {
          return;
        }

        const durationMs = Date.now() - started;
        const status = res.statusCode || 0;
        const is5xx = status >= 500;
        const is4xx = status >= 400 && status < 500;
        const isSlow = slowThresholdMs > 0 && durationMs >= slowThresholdMs;

        if (!is5xx && !(capture4xx && is4xx) && !isSlow) {
          return;
        }

        const url = req.originalUrl || req.url || '/';
        const method = req.method || 'GET';
        const ip = req.ip || req.socket?.remoteAddress;

        captureHttpFailure(
          {
            url,
            method,
            status_code: status,
            duration_ms: durationMs,
            ip,
          },
          {
            tags: {
              ...(req.route?.path ? { route: String(req.route.path) } : {}),
            },
          },
        );
        void flush();
      } catch {
        // never break the host
      }
    });

    next();
  };
}

/**
 * Express error middleware. Place after routes:
 *   app.use(ogEagleEyeErrorHandler());
 *
 * Captures the error, flushes, then forwards to the next error handler
 * (or default Express handler) so response semantics are preserved.
 */
export function ogEagleEyeErrorHandler() {
  return function ogEagleEyeErrorMiddleware(
    err: unknown,
    _req: ExpressLikeRequest,
    _res: ExpressLikeResponse,
    next: ExpressNext,
  ): void {
    try {
      captureException(err);
      void flush().finally(() => next(err));
    } catch {
      next(err);
    }
  };
}

/** Alias matching the PLAN naming. */
export const errorHandler = ogEagleEyeErrorHandler;
