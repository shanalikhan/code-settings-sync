# Filesystem Sync

Select **File System** in the Settings Sync settings page, then select an
absolute folder outside the VS Code User directory. Use the existing export
and import commands to transfer settings. GitHub Gist remains the default;
filesystem mode does not require a GitHub token or change the configured Gist.

The selected directory contains one `settings-sync.json` bundle. A locally
synchronized Dropbox, OneDrive or similar folder can transport that file;
this extension does not authenticate with, or implement, those services.
Select the same folder on the other machine and import after synchronization
has completed. Filesystem upload/download timestamps are stored separately
from Gist timestamps in `syncLocalSettings.json`.

## Data and Failure Handling

- Bundles contain plaintext settings and snippets. Settings can themselves
  contain sensitive values. Use only a trusted folder and trusted bundles;
  do not publish the bundle. Local `syncLocalSettings.json` and lock files
  are excluded. Existing custom-file selections remain explicit opt-ins.
- Existing file-selection rules are retained. Do not place symlinks to
  private or external files in the selected settings tree or custom files.
  The filesystem provider rejects unsafe encoded bundle paths and a
  symlink at the bundle file, but is not a hostile-filesystem sandbox.
- Export validates the bundle, acquires an exclusive local lock and replaces
  the bundle through a same-directory temporary file. A failed replacement
  preserves the previous bundle. The lock is not a distributed cloud lock.
- A process crash can leave a lock. Inspect the folder and ensure no writer
  is active before manually removing a stale lock; it is not stolen
  automatically. Concurrent offline edits still require user reconciliation.
- Import writes multiple files, so a later failure can leave earlier files
  updated. Failed writes do not advance import history. Back up important
  settings before importing. There is no multi-file rollback guarantee.
- Bundles are limited to version 1, 64 MiB and 10,000 file entries.

## Development Verification

`npm run test-filesystem` compiles and runs storage and pipeline tests using
synthetic temporary settings and a VS Code API test double. Network requests
are disabled by that runner.

For an installed VS Code executable, set `SETTINGS_SYNC_CODE` to its path and
run `npm run test-filesystem-host`. This creates a separate temporary portable
profile and extensions directory, verifies its unique configuration marker,
and exercises the registered export/import commands. It does not use the
personal VS Code profile. The helper has a two-minute process timeout.

The legacy Webpack 4 build needs `NODE_OPTIONS=--openssl-legacy-provider` on
modern Node versions. This change does not upgrade legacy dependencies or
claim that all existing repository lint/tests pass.
