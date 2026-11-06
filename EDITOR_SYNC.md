# Open Editor Downloads

Downloads now update an already open, clean file or VS Code settings document
through `WorkspaceEdit` followed by the document's normal save operation.
This keeps the editor model and file content in step instead of writing
behind the editor's back. Both `file` and local `vscode-userdata` settings
resources are recognized. Files without an open document retain normal file
writes. This does not add Git synchronization, conflict merging or polling.

If a target document contains unsaved edits, the write is refused rather
than silently discarding or saving those edits. Save or revert them yourself
before downloading again; force-download does not bypass this protection.
Failed writes do not record a successful download timestamp or configuration
save, and a previously running upload watcher is restored after import.

An edit cancellation, save refusal or a detected content change during the
edit also reports a failed write. A failed save can leave the downloaded
content in a dirty buffer for inspection. Normal VS Code save participants
still apply. This is not an atomic multi-file transaction: other files may
already have changed when a later file fails. It does not promise protection
against every external filesystem race or remote URI/provider arrangement.

## Verification

`npm run test-editor-writes` runs three failure-path checks using an explicit
VS Code API test double and real temporary files. It covers cancellation,
save refusal and content changes while an edit is being applied.

Set `SETTINGS_SYNC_CODE` to the installed VS Code executable, then run
`npm run test-editor-host`. The helper creates a separate temporary portable
profile and empty extensions directory, checks a unique configuration marker,
and uses real editor documents (including the actual Preferences settings
JSON command). It does not use the personal VS Code profile. Its subprocess
has a two-minute timeout, and its own temporary directory is path-checked
before cleanup.

The import pipeline checks use synthetic configuration persistence and a
fixture-only Gist read method. The token is empty, public-Gist mode is used,
and the client base address is loopback-only. This is not a live GitHub,
registered-command or two-machine network end-to-end test. An early test
setup with a synthetic token triggered the old constructor's automatic
authentication probe and received HTTP 401; no real credential was used.
The final setup avoids that probe.

The legacy repository-wide lint/test results are separate from these checks.
No full-suite or old-VS-Code-version success is implied.
