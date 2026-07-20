import { randomUUID } from 'node:crypto';
import { hash, scrub } from './scrubber.js';
import { parseStack } from './stack.js';
import type {
  HttpFailureRequest,
  SdkInfo,
  OGEagleEyeEvent,
} from './types.js';

export const SDK_NAME = 'monitor-node';
export const SDK_VERSION = '0.2.0';
export const MAX_CONTEXT_BYTES = 8192;

export type PayloadBuilderOptions = {
  environment: string;
  release?: string | null;
  appRoot: string;
  sdkName?: string;
  sdkVersion?: string;
};

export class PayloadBuilder {
  private readonly environment: string;
  private readonly release: string | null;
  private readonly appRoot: string;
  private readonly sdk: SdkInfo;

  constructor(options: PayloadBuilderOptions) {
    this.environment = options.environment;
    this.release =
      options.release !== undefined && options.release !== null && options.release !== ''
        ? String(options.release)
        : null;
    this.appRoot = options.appRoot;
    this.sdk = {
      name: options.sdkName && options.sdkName !== '' ? options.sdkName : SDK_NAME,
      version:
        options.sdkVersion && options.sdkVersion !== ''
          ? options.sdkVersion
          : SDK_VERSION,
    };
  }

  forException(
    error: unknown,
    context: Record<string, unknown> = {},
  ): OGEagleEyeEvent {
    const err = toError(error);
    const payload = this.base('error');
    payload.exception = {
      class: err.name || 'Error',
      message: err.message || String(error),
      frames: parseStack(err, this.appRoot),
    };
    payload.context = this.prepareContext(context);
    this.maybeAttachUser(payload, context);
    this.maybeAttachTags(payload, context);
    return payload;
  }

  forMessage(
    message: string,
    level = 'error',
    context: Record<string, unknown> = {},
  ): OGEagleEyeEvent {
    const payload = this.base('log');
    payload.context = this.prepareContext({
      ...context,
      message: String(message),
      level: String(level),
    });
    this.maybeAttachTags(payload, context);
    return payload;
  }

  forHeartbeat(): OGEagleEyeEvent {
    return this.base('heartbeat');
  }

  forHttpFailure(
    request: HttpFailureRequest,
    context: Record<string, unknown> = {},
  ): OGEagleEyeEvent {
    const payload = this.base('http_failure');
    const normalized: NonNullable<OGEagleEyeEvent['request']> = {
      url: request.url || '/',
      method: request.method || 'GET',
    };
    if (request.status_code !== undefined) {
      normalized.status_code = Number(request.status_code);
    }
    if (request.duration_ms !== undefined) {
      normalized.duration_ms = Math.round(Number(request.duration_ms));
    }
    if (request.ip_hash) {
      normalized.ip_hash = request.ip_hash;
    } else if (request.ip) {
      normalized.ip_hash = hash(request.ip);
    }
    payload.request = normalized;
    payload.context = this.prepareContext(context);
    this.maybeAttachUser(payload, context);
    this.maybeAttachTags(payload, context);
    return payload;
  }

  forScanResult(
    scanResult: Record<string, unknown>,
    context: Record<string, unknown> = {},
  ): OGEagleEyeEvent {
    const payload = this.base('scan_result');
    const scan = {
      started_at: scanResult.started_at ?? null,
      finished_at: scanResult.finished_at ?? null,
      is_baseline: Boolean(scanResult.is_baseline),
      paths: Array.isArray(scanResult.paths) ? scanResult.paths : [],
      files_scanned: Number(scanResult.files_scanned ?? 0),
      severity: String(scanResult.severity ?? 'none'),
      findings_count: Number(scanResult.findings_count ?? 0),
      integrity_changes_count: Number(
        scanResult.integrity_changes_count ?? 0,
      ),
      findings: Array.isArray(scanResult.findings) ? scanResult.findings : [],
      integrity_changes: Array.isArray(scanResult.integrity_changes)
        ? scanResult.integrity_changes
        : [],
    };
    payload.context = this.prepareContext({ ...context, scan });
    this.maybeAttachTags(payload, context);
    return payload;
  }

  getSdkInfo(): SdkInfo {
    return { ...this.sdk };
  }

  private base(eventType: OGEagleEyeEvent['event_type']): OGEagleEyeEvent {
    const payload: OGEagleEyeEvent = {
      schema_version: 1,
      event_type: eventType,
      event_id: randomUUID(),
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      environment: this.environment,
      sdk: { ...this.sdk },
    };
    if (this.release !== null) {
      payload.release = this.release;
    }
    return payload;
  }

  private prepareContext(
    context: Record<string, unknown>,
  ): Record<string, unknown> {
    const scrubbed = scrub(context);
    if (!scrubbed || typeof scrubbed !== 'object' || Array.isArray(scrubbed)) {
      return {};
    }

    const encoded = JSON.stringify(scrubbed);
    if (encoded.length <= MAX_CONTEXT_BYTES) {
      return scrubbed as Record<string, unknown>;
    }

    const record = scrubbed as Record<string, unknown>;
    return {
      _truncated: true,
      message:
        typeof record.message === 'string'
          ? record.message
          : 'context exceeded 8KB',
    };
  }

  private maybeAttachUser(
    payload: OGEagleEyeEvent,
    context: Record<string, unknown>,
  ): void {
    if (!context.user || typeof context.user !== 'object') {
      return;
    }
    const user = scrub(context.user) as Record<string, unknown>;
    if (typeof user.email === 'string' && !String(user.email).includes('[Filtered]')) {
      user.email_hash = user.email;
      delete user.email;
    }
    payload.user = user;
    if (payload.context?.user) {
      const { user: _u, ...rest } = payload.context;
      payload.context = rest;
    }
  }

  private maybeAttachTags(
    payload: OGEagleEyeEvent,
    context: Record<string, unknown>,
  ): void {
    if (!context.tags || typeof context.tags !== 'object') {
      return;
    }
    payload.tags = scrub(context.tags) as Record<string, unknown>;
    if (payload.context?.tags) {
      const { tags: _t, ...rest } = payload.context;
      payload.context = rest;
    }
  }
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  const err = new Error(typeof error === 'string' ? error : String(error));
  err.name = typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name: unknown }).name)
    : 'Error';
  return err;
}
