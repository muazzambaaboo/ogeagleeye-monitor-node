# File integrity & heuristic scanning (v1)

OGEagleEye's `scan_result` path is an **integrity + heuristics** helper, **not** an antivirus,
malware sandbox, or WAF.

## What it does

| Capability | PHP / Laravel SDK | Node SDK |
|------------|-------------------|----------|
| Baseline manifest (`path → sha256`) | Yes | Yes |
| NEW / MODIFIED / DELETED diffs | Yes | Yes |
| Exclude `vendor` / `node_modules` by default | Yes | Yes |
| Always include `public/uploads` (and similar) | Yes | Yes |
| PHP heuristics (`eval(base64_decode(`, `gzinflate(base64_`, obfuscated blobs, PHP in upload dirs, recent core framework mtimes) | Yes | **No** |

Each heuristic finding includes: `path`, `rule_id`, `severity`, `excerpt` (first ≤120 chars).

## What it does **not** do

- Detect novel malware, packed binaries, or non-PHP webshells beyond the listed patterns
- Replace ClamAV, OSSEC, CrowdStrike, or a real WAF
- Guarantee zero false positives (obfuscated-blob and core-mtime rules are intentionally noisy)
- Scan files outside the configured root / path list

Treat critical findings as **investigation signals**, not automatic proof of compromise.

## PHP / Laravel usage

```php
use OGEagleEye\Monitor\OGEagleEye;

OGEagleEye::init([/* key, endpoint, … */]);
$result = OGEagleEye::scan(['app', 'public'], [
    'root' => __DIR__,
    'manifest_path' => __DIR__.'/.ogeagleeye-manifest.json',
]);
OGEagleEye::flush();
```

Laravel:

```bash
php artisan ogeagleeye:scan
php artisan ogeagleeye:scan app public --reset-baseline
php artisan ogeagleeye:scan --no-heuristics
```

Schedule (example):

```php
$schedule->command('ogeagleeye:scan')->dailyAt('02:15');
```

## Node usage

```js
import { init, scan, flush } from '@ogeagleeye/monitor-node';

init({ key: process.env.OGEAGLEEYE_KEY, endpoint: process.env.OGEAGLEEYE_ENDPOINT });
scan(['src', 'public'], { root: process.cwd() });
await flush();
```

## Panel

`scan_result` events become **Scan reports** (severity filter, findings table, acknowledge).
A project alert rule with trigger **Scan critical finding** fires when severity is critical
(cooldown applies per project so scans cannot storm channels).
