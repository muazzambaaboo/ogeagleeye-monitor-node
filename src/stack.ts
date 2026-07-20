import { readFileSync } from 'node:fs';
import { normalize, relative, sep } from 'node:path';
import type { StackFrame } from './types.js';

const FRAME_RE =
  /^\s*at (?:(.+?)\s+\()?(?:(.+?):(\d+)(?::(\d+))?|native)\)?$/;

export function parseStack(
  error: Error,
  appRoot: string,
  contextLines = 3,
): StackFrame[] {
  const stack = error.stack ?? '';
  const lines = stack.split('\n').slice(1);
  const frames: StackFrame[] = [];

  for (const line of lines) {
    const match = FRAME_RE.exec(line);
    if (!match) {
      continue;
    }

    const fn = match[1] ?? '{anonymous}';
    const file = match[2] ?? '';
    const lineNo = match[3] ? Number(match[3]) : 0;

    frames.push(buildFrame(file, lineNo, fn, appRoot, contextLines));
  }

  if (frames.length === 0 && error.message) {
    frames.push(
      buildFrame(
        (error as Error & { fileName?: string }).fileName ?? '[unknown]',
        0,
        error.name || 'Error',
        appRoot,
        contextLines,
      ),
    );
  }

  return frames;
}

function buildFrame(
  file: string,
  line: number,
  fn: string,
  appRoot: string,
  contextLines: number,
): StackFrame {
  const displayFile = relativize(file, appRoot);
  const inApp = isInApp(file, appRoot);
  const frame: StackFrame = {
    file: displayFile || '[internal]',
    line,
    function: fn,
    in_app: inApp,
    context_line: '',
    pre_context: [],
    post_context: [],
  };

  if (file && line > 0 && !file.startsWith('node:') && file !== 'native') {
    try {
      const ctx = readContext(file, line, contextLines);
      frame.context_line = ctx.context_line;
      frame.pre_context = ctx.pre_context;
      frame.post_context = ctx.post_context;
    } catch {
      // unreadable file — leave empty context
    }
  }

  return frame;
}

export function isInApp(file: string, appRoot: string): boolean {
  if (!file || !appRoot) {
    return false;
  }
  if (file.startsWith('node:') || file === 'native') {
    return false;
  }

  const normalizedFile = normalizePath(file);
  const normalizedRoot = normalizePath(appRoot);
  if (!normalizedFile.startsWith(normalizedRoot)) {
    return false;
  }

  if (normalizedFile.includes('/node_modules/')) {
    return false;
  }

  return true;
}

function relativize(file: string, appRoot: string): string {
  if (!file || !appRoot) {
    return file.replace(/\\/g, '/');
  }

  const normalizedFile = normalizePath(file);
  const normalizedRoot = normalizePath(appRoot);
  if (normalizedFile.startsWith(normalizedRoot)) {
    return normalizedFile.slice(normalizedRoot.length).replace(/^\//, '');
  }

  try {
    return relative(appRoot, file).split(sep).join('/');
  } catch {
    return file.replace(/\\/g, '/');
  }
}

function normalizePath(path: string): string {
  return normalize(path).replace(/\\/g, '/').replace(/\/+$/, '');
}

function readContext(
  file: string,
  line: number,
  contextLines: number,
): { context_line: string; pre_context: string[]; post_context: string[] } {
  const content = readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  const index = line - 1;
  if (index < 0 || index >= lines.length) {
    return { context_line: '', pre_context: [], post_context: [] };
  }

  const start = Math.max(0, index - contextLines);
  const end = Math.min(lines.length - 1, index + contextLines);

  return {
    context_line: lines[index] ?? '',
    pre_context: lines.slice(start, index),
    post_context: lines.slice(index + 1, end + 1),
  };
}
