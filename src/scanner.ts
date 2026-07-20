import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export const MANIFEST_VERSION = 1;

export const DEFAULT_EXCLUDE = [
  'node_modules',
  'vendor',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'coverage',
  '.ogeagleeye-manifest.json',
];

/** Always include these prefixes even if under an exclude name. */
export const UPLOAD_DIR_MARKERS = [
  'public/uploads',
  'public/upload',
  'uploads',
];

export type IntegrityChange = {
  path: string;
  change: 'NEW' | 'MODIFIED' | 'DELETED';
  sha256: string | null;
};

export type ScanResult = {
  started_at: string;
  finished_at: string;
  is_baseline: boolean;
  paths: string[];
  files_scanned: number;
  integrity_changes: IntegrityChange[];
  findings: [];
  severity: 'none' | 'info';
  findings_count: number;
  integrity_changes_count: number;
};

export type ScannerOptions = {
  root?: string;
  manifestPath?: string;
  exclude?: string[];
  maxFiles?: number;
};

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Node file-integrity scanner (manifest diff only — no PHP heuristics).
 */
export class Scanner {
  readonly root: string;
  readonly manifestPath: string;
  private readonly exclude: string[];
  private readonly maxFiles: number;

  constructor(options: ScannerOptions = {}) {
    this.root = toPosix(resolve(options.root || process.cwd())).replace(
      /\/+$/,
      '',
    );
    this.manifestPath = toPosix(
      resolve(
        options.manifestPath || join(this.root, '.ogeagleeye-manifest.json'),
      ),
    );
    this.exclude = (options.exclude || DEFAULT_EXCLUDE).map((e) =>
      toPosix(e).replace(/^\/+|\/+$/g, ''),
    );
    this.maxFiles = Math.max(1, options.maxFiles ?? 5000);
  }

  scan(paths: string[] | null = null, resetBaseline = false): ScanResult {
    const startedAt = nowIso();
    const pathList = this.normalizePaths(paths);
    const current = this.buildManifest(pathList);
    const previous = resetBaseline ? null : this.loadManifest();
    const isBaseline = previous === null;

    const integrityChanges = isBaseline
      ? []
      : this.diffManifests(previous!, current);

    if (isBaseline || resetBaseline) {
      this.saveManifest(current);
    }

    const severity: ScanResult['severity'] =
      integrityChanges.length > 0 ? 'info' : 'none';

    return {
      started_at: startedAt,
      finished_at: nowIso(),
      is_baseline: isBaseline,
      paths: pathList,
      files_scanned: Object.keys(current).length,
      integrity_changes: integrityChanges,
      findings: [],
      severity,
      findings_count: 0,
      integrity_changes_count: integrityChanges.length,
    };
  }

  private normalizePaths(paths: string[] | null): string[] {
    if (!paths || paths.length === 0) {
      return ['.'];
    }
    const out: string[] = [];
    for (const p of paths) {
      const rel = this.toRelative(p);
      if (rel === null) {
        continue;
      }
      out.push(rel === '' ? '.' : rel);
    }
    return out.length === 0 ? ['.'] : [...new Set(out)];
  }

  private buildManifest(paths: string[]): Record<string, string> {
    const files: Record<string, string> = {};
    let count = 0;

    for (const path of paths) {
      const absolute =
        path === '.' ? this.root : toPosix(join(this.root, path));
      if (!existsSync(absolute)) {
        continue;
      }

      const st = statSync(absolute);
      if (st.isFile()) {
        const rel = this.toRelative(absolute);
        if (rel !== null && !this.shouldSkip(rel)) {
          files[rel] = this.hashFile(absolute);
          count++;
        }
        continue;
      }

      for (const file of this.walkFiles(absolute)) {
        if (count >= this.maxFiles) {
          break;
        }
        const rel = this.toRelative(file);
        if (rel === null || this.shouldSkip(rel)) {
          continue;
        }
        files[rel] = this.hashFile(file);
        count++;
      }
    }

    return Object.fromEntries(
      Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  private walkFiles(dir: string): string[] {
    const out: string[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }

    for (const name of entries) {
      const full = toPosix(join(dir, name));
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        out.push(...this.walkFiles(full));
      } else if (st.isFile()) {
        out.push(full);
      }
    }
    return out;
  }

  private shouldSkip(relativePath: string): boolean {
    const relative = relativePath.replace(/^\/+/, '');
    if (!relative || relative === '.ogeagleeye-manifest.json') {
      return true;
    }

    if (this.isUnderUploadDir(relative)) {
      return false;
    }

    for (const ex of this.exclude) {
      if (!ex) {
        continue;
      }
      if (relative === ex || relative.startsWith(`${ex}/`)) {
        return true;
      }
      const re = new RegExp(`(^|/)${escapeRegExp(ex)}(/|$)`);
      if (re.test(relative)) {
        return true;
      }
    }
    return false;
  }

  private isUnderUploadDir(relative: string): boolean {
    return UPLOAD_DIR_MARKERS.some(
      (marker) => relative === marker || relative.startsWith(`${marker}/`),
    );
  }

  private toRelative(path: string): string | null {
    const normalized = toPosix(path);
    if (normalized === '' || normalized === '.') {
      return '.';
    }

    const absolute = toPosix(resolve(this.root, path));
    const root = this.root;
    if (absolute === root) {
      return '';
    }
    if (absolute.startsWith(`${root}/`)) {
      return absolute.slice(root.length + 1);
    }

    // Already relative-ish
    const rel = toPosix(relative(root, absolute));
    if (rel.startsWith('..')) {
      return null;
    }
    return rel === '' ? '' : rel;
  }

  private hashFile(absolute: string): string {
    const buf = readFileSync(absolute);
    return createHash('sha256').update(buf).digest('hex');
  }

  private diffManifests(
    previous: Record<string, string>,
    current: Record<string, string>,
  ): IntegrityChange[] {
    const changes: IntegrityChange[] = [];

    for (const [path, hash] of Object.entries(current)) {
      if (!(path in previous)) {
        changes.push({ path, change: 'NEW', sha256: hash });
      } else if (previous[path] !== hash) {
        changes.push({ path, change: 'MODIFIED', sha256: hash });
      }
    }

    for (const path of Object.keys(previous)) {
      if (!(path in current)) {
        changes.push({ path, change: 'DELETED', sha256: null });
      }
    }

    return changes;
  }

  private loadManifest(): Record<string, string> | null {
    if (!existsSync(this.manifestPath)) {
      return null;
    }
    try {
      const raw = readFileSync(this.manifestPath, 'utf8');
      const decoded = JSON.parse(raw) as {
        files?: Record<string, string>;
      };
      if (!decoded.files || typeof decoded.files !== 'object') {
        return null;
      }
      const files: Record<string, string> = {};
      for (const [path, hash] of Object.entries(decoded.files)) {
        if (typeof path === 'string' && typeof hash === 'string') {
          files[path] = hash;
        }
      }
      return files;
    } catch {
      return null;
    }
  }

  private saveManifest(files: Record<string, string>): void {
    const dir = dirname(this.manifestPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(
      this.manifestPath,
      JSON.stringify(
        {
          version: MANIFEST_VERSION,
          created_at: nowIso(),
          files,
        },
        null,
        2,
      ),
      'utf8',
    );
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
