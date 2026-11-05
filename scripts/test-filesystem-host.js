"use strict";

const assert = require("assert").strict;
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const executable = process.env.SETTINGS_SYNC_CODE;
if (!executable)
  throw new Error(
    "Set SETTINGS_SYNC_CODE to the VS Code executable, not its CLI script."
  );
const project = path.resolve(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "settings-sync-host-"));
const portable = path.join(root, "portable");
const user = path.join(portable, "user-data", "User");
const extensions = path.join(portable, "extensions");
const share = path.join(root, "Share");
fs.mkdirSync(user, { recursive: true });
fs.mkdirSync(extensions, { recursive: true });
fs.mkdirSync(path.join(user, "snippets"));
fs.writeFileSync(
  path.join(user, "settings.json"),
  JSON.stringify({
    "editor.fontSize": 14,
    "workbench.startupEditor": "none",
    "update.mode": "none",
    "telemetry.telemetryLevel": "off",
    "extensions.autoUpdate": false,
    "sync.gist": path.basename(root),
    "sync.autoUpload": false,
    "sync.autoDownload": false,
    "sync.syncExtensions": false,
    "sync.quietSync": true,
    "sync.forceUpload": true,
    "sync.forceDownload": true
  })
);
fs.writeFileSync(path.join(user, "snippets", "host.json"), '{"host":{}}');
fs.writeFileSync(
  path.join(user, "syncLocalSettings.json"),
  JSON.stringify({
    syncMethod: "FileSystem",
    fileSystem: { folder: share },
    disableUpdateMessage: true,
    version: Number(
      require("../package.json")
        .version.split(".")
        .join("")
    )
  })
);
const env = {
  ...process.env,
  VSCODE_PORTABLE: portable,
  SETTINGS_SYNC_HOST_ROOT: root
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VSCODE_IPC_HOOK_CLI;
try {
  const result = spawnSync(
    executable,
    [
      "--new-window",
      "--disable-extensions",
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes",
      "--disable-gpu",
      "--user-data-dir=" + path.join(portable, "user-data"),
      "--extensions-dir=" + extensions,
      "--extensionDevelopmentPath=" + project,
      "--extensionTestsPath=" +
        path.join(project, "scripts", "filesystem-host-runner.js")
    ],
    { env, windowsHide: true, timeout: 120000, encoding: "utf8" }
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "Isolated VS Code test host failed");
  assert.ok(
    fs.existsSync(path.join(root, "host-passed.json")),
    "Host runner did not finish"
  );
  process.stdout.write(
    fs.readFileSync(path.join(root, "host-passed.json"), "utf8") + "\n"
  );
  process.stdout.write(
    "Isolated VS Code filesystem command round trip: PASS\n"
  );
} finally {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith("settings-sync-host-"));
  require("fs-extra").removeSync(root);
}
