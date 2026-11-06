"use strict";

const assert = require("assert").strict;
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const executable = process.env.SETTINGS_SYNC_CODE;
assert.ok(executable, "Set SETTINGS_SYNC_CODE to the VS Code executable.");
const project = path.resolve(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "settings-sync-editor-"));
const portable = path.join(root, "portable");
const userData = path.join(portable, "user-data");
const extensions = path.join(portable, "extensions");
fs.mkdirSync(path.join(userData, "User"), { recursive: true });
fs.mkdirSync(extensions, { recursive: true });
fs.writeFileSync(
  path.join(userData, "User", "settings.json"),
  JSON.stringify({
    "sync.gist": path.basename(root),
    "sync.autoUpload": false,
    "sync.autoDownload": false,
    "sync.syncExtensions": false,
    "workbench.startupEditor": "none",
    "update.mode": "none",
    "extensions.autoUpdate": false,
    "telemetry.telemetryLevel": "off",
    "files.autoSave": "off"
  })
);
fs.writeFileSync(
  path.join(userData, "User", "syncLocalSettings.json"),
  JSON.stringify({
    disableUpdateMessage: true,
    version: Number(
      require("../package.json")
        .version.split(".")
        .join("")
    ),
    githubSettings: { token: "" }
  })
);
const env = {
  ...process.env,
  VSCODE_PORTABLE: portable,
  SETTINGS_SYNC_EDITOR_ROOT: root
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
      "--user-data-dir=" + userData,
      "--extensions-dir=" + extensions,
      "--extensionDevelopmentPath=" + project,
      "--extensionTestsPath=" + path.join(__dirname, "editor-host-runner.js")
    ],
    { env, windowsHide: true, timeout: 120000, encoding: "utf8" }
  );
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "Isolated editor tests failed");
  console.log(fs.readFileSync(path.join(root, "passed.json"), "utf8"));
} finally {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith("settings-sync-editor-"));
  require("fs-extra").removeSync(root);
}
