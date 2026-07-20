import { createHash } from 'node:crypto';

const SENSITIVE_KEY = /password|secret|token|authorization|cookie/i;

function isPiiKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower === 'ip' ||
    lower === 'email' ||
    lower.endsWith('_ip') ||
    lower.endsWith('_email') ||
    lower === 'ip_address' ||
    lower === 'email_address'
  );
}

export function hash(value: string): string {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function scrub(data: unknown): unknown {
  if (data === null || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => scrub(item));
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[Filtered]';
      continue;
    }

    if (value !== null && typeof value === 'object') {
      out[key] = scrub(value);
      continue;
    }

    if (isPiiKey(key) && typeof value === 'string' && value !== '') {
      out[key] = hash(value);
      continue;
    }

    out[key] = value;
  }

  return out;
}
