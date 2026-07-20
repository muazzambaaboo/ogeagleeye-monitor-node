import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '../src/client.js';
import { Scanner } from '../src/scanner.js';
import type { OGEagleEyeEvent, Transport } from '../src/types.js';

class RecordingTransport implements Transport {
  sent: OGEagleEyeEvent[] = [];
  async send(_endpoint: string, _key: string, payload: OGEagleEyeEvent): Promise<void> {
    this.sent.push(payload);
  }
}

describe('Scanner (manifest diff)', () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function setup(): { root: string; manifestPath: string } {
    root = mkdtempSync(join(tmpdir(), 'OGEagleEye-node-scan-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'public', 'uploads'), { recursive: true });
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
    return { root, manifestPath: join(root, '.ogeagleeye-manifest.json') };
  }

  it('clean first run is baseline with no findings', () => {
    const { root: r, manifestPath } = setup();
    writeFileSync(join(r, 'src', 'index.js'), 'console.log(1)\n');
    writeFileSync(join(r, 'public', 'uploads', 'a.txt'), 'ok');

    const scanner = new Scanner({ root: r, manifestPath });
    const result = scanner.scan(['.']);

    expect(result.is_baseline).toBe(true);
    expect(result.findings_count).toBe(0);
    expect(result.findings).toEqual([]);
    expect(result.severity).toBe('none');
    expect(result.files_scanned).toBeGreaterThan(0);
  });

  it('reports NEW / MODIFIED / DELETED on second run', () => {
    const { root: r, manifestPath } = setup();
    writeFileSync(join(r, 'src', 'a.js'), 'a\n');
    writeFileSync(join(r, 'src', 'b.js'), 'b\n');

    const scanner = new Scanner({ root: r, manifestPath });
    scanner.scan(['.']);

    writeFileSync(join(r, 'src', 'a.js'), 'a2\n');
    writeFileSync(join(r, 'src', 'c.js'), 'c\n');
    rmSync(join(r, 'src', 'b.js'));

    const second = scanner.scan(['.']);
    expect(second.is_baseline).toBe(false);

    const byChange: Record<string, string[]> = {
      NEW: [],
      MODIFIED: [],
      DELETED: [],
    };
    for (const c of second.integrity_changes) {
      byChange[c.change].push(c.path);
    }

    expect(byChange.MODIFIED).toContain('src/a.js');
    expect(byChange.NEW).toContain('src/c.js');
    expect(byChange.DELETED).toContain('src/b.js');
    expect(second.severity).toBe('info');
  });

  it('excludes node_modules but includes uploads', () => {
    const { root: r, manifestPath } = setup();
    writeFileSync(join(r, 'src', 'ok.js'), 'ok\n');
    writeFileSync(join(r, 'node_modules', 'pkg', 'x.js'), 'evil\n');
    writeFileSync(join(r, 'public', 'uploads', 'keep.txt'), 'ok');

    const scanner = new Scanner({ root: r, manifestPath });
    scanner.scan(['.']);

    const files = JSON.parse(readFileSync(manifestPath, 'utf8')).files as Record<
      string,
      string
    >;
    const paths = Object.keys(files);

    expect(paths).toContain('src/ok.js');
    expect(paths).toContain('public/uploads/keep.txt');
    expect(paths).not.toContain('node_modules/pkg/x.js');
  });

  it('client.scan buffers scan_result with sdk 0.2.0', async () => {
    const { root: r, manifestPath } = setup();
    writeFileSync(join(r, 'src', 'ok.js'), 'ok\n');

    const transport = new RecordingTransport();
    const client = new Client({
      key: 'oge_test',
      endpoint: 'http://example.test/api/v1/events',
      environment: 'testing',
      transport,
      registerHandlers: false,
      flushIntervalMs: 0,
    });

    const result = client.scan(['.'], { root: r, manifestPath });
    expect(result).not.toBeNull();
    expect(client.getBuffer()).toHaveLength(1);
    expect(client.getBuffer()[0].event_type).toBe('scan_result');
    expect(client.getBuffer()[0].sdk.version).toBe('0.2.0');

    await client.flush();
    client.close();
    expect(transport.sent).toHaveLength(1);
  });
});
