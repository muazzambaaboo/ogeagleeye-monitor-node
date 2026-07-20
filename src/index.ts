export type {
  EventType,
  HttpFailureRequest,
  InitOptions,
  SdkInfo,
  OGEagleEyeEvent,
  StackFrame,
  Transport,
} from './types.js';

export { Client, init, setClient, getClient, captureException, captureMessage, heartbeat, captureHttpFailure, scan, flush } from './client.js';
export { PayloadBuilder, SDK_NAME, SDK_VERSION } from './payload.js';
export { FetchTransport } from './transport.js';
export { scrub, hash } from './scrubber.js';
export { parseStack, isInApp } from './stack.js';
export { Scanner, DEFAULT_EXCLUDE, UPLOAD_DIR_MARKERS } from './scanner.js';
export type { ScanResult, IntegrityChange, ScannerOptions } from './scanner.js';
export {
  requestHandler,
  ogEagleEyeErrorHandler,
  errorHandler,
} from './express.js';
export type { RequestHandlerOptions } from './express.js';
