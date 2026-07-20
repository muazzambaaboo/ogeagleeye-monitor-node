export type SdkInfo = {
  name: string;
  version: string;
};

export type EventType =
  | 'error'
  | 'http_failure'
  | 'heartbeat'
  | 'bug_report'
  | 'scan_result'
  | 'log';

export type StackFrame = {
  file: string;
  line: number;
  function: string;
  in_app: boolean;
  context_line: string;
  pre_context: string[];
  post_context: string[];
};

export type OGEagleEyeEvent = {
  schema_version: 1;
  event_type: EventType;
  event_id: string;
  timestamp: string;
  environment: string;
  release?: string;
  sdk: SdkInfo;
  exception?: {
    class: string;
    message: string;
    frames: StackFrame[];
  };
  request?: {
    url: string;
    method: string;
    status_code?: number;
    duration_ms?: number;
    ip_hash?: string;
  };
  user?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export type Transport = {
  send(endpoint: string, ingestKey: string, payload: OGEagleEyeEvent): Promise<void>;
};

export type InitOptions = {
  key: string;
  endpoint: string;
  environment?: string;
  release?: string | null;
  sampleRate?: number;
  debug?: boolean;
  appRoot?: string;
  /** Register process uncaughtException / unhandledRejection hooks (default true). */
  registerHandlers?: boolean;
  /**
   * After capturing an uncaughtException, exit the process (default true).
   * Preserves Node crash semantics when a listener is attached.
   */
  exitOnUncaught?: boolean;
  /** Flush interval in ms (default 5000). */
  flushIntervalMs?: number;
  /** Max buffered events before automatic flush (default 20). */
  maxBatchSize?: number;
  /** Inject a custom transport (tests). */
  transport?: Transport;
  sdkName?: string;
  sdkVersion?: string;
};

export type HttpFailureRequest = {
  url: string;
  method: string;
  status_code?: number;
  duration_ms?: number;
  ip?: string;
  ip_hash?: string;
};
