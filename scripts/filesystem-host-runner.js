"use strict";

const assert = require("assert").strict;
const fs = require("fs").promises;
const path = require("path");
const vscode = require("vscode");

exports.run = async function() {
  const root = process.env.SETTINGS_SYNC_HOST_ROOT;
  assert.ok(root && path.basename(root).startsWith("settings-sync-host-"));
  if (process.env.VSCODE_PORTABLE) {
    assert.equal(
      path.resolve(process.env.VSCODE_PORTABLE),
      path.join(root, "portable")
    );
  }
  assert.equal(
    vscode.workspace.getConfiguration("sync").get("gist"),
    path.basename(root),
    "Unexpected profile; refusing to execute sync commands"
  );
  const user = path.join(root, "portable", "user-data", "User");
  const share = path.join(root, "Share", "settings-sync.json");
  const extension = vscode.extensions.getExtension("Shan.code-settings-sync");
  assert.ok(extension, "Development extension not registered");
  await extension.activate();

  async function waitFor(check) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      try {
        if (await check()) return;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Timed out waiting for the isolated filesystem operation");
  }

  await vscode.commands.executeCommand("extension.updateSettings");
  await waitFor(
    async () =>
      JSON.parse(await fs.readFile(share, "utf8")).files["snippets|host.json"]
  );
  const bundle = JSON.parse(await fs.readFile(share, "utf8"));
  assert.ok(!bundle.files["syncLocalSettings.json"]);
  const settings = JSON.parse(
    await fs.readFile(path.join(user, "settings.json"), "utf8")
  );
  settings["editor.fontSize"] = 20;
  await fs.writeFile(
    path.join(user, "settings.json"),
    JSON.stringify(settings)
  );
  await fs.unlink(path.join(user, "snippets", "host.json"));
  await vscode.commands.executeCommand("extension.downloadSettings");
  await waitFor(
    async () =>
      JSON.parse(await fs.readFile(path.join(user, "settings.json"), "utf8"))[
        "editor.fontSize"
      ] === 14
  );
  assert.equal(
    await fs.readFile(path.join(user, "snippets", "host.json"), "utf8"),
    '{"host":{}}'
  );
  assert.equal(
    vscode.workspace.getConfiguration("sync").get("gist"),
    path.basename(root)
  );
  if (process.env.SETTINGS_SYNC_HOST_LEGACY === "1") {
    const Mocha = require("mocha");
    const mocha = new Mocha({ timeout: 10000 });
    const project =
      process.env.SETTINGS_SYNC_LEGACY_PROJECT || path.resolve(__dirname, "..");
    mocha.addFile(path.join(project, "out/test/extension.test.js"));
    mocha.addFile(
      path.join(project, "out/test/service/fileService/fileService.test.js")
    );
    const failures = await new Promise(resolve => mocha.run(resolve));
    assert.equal(
      failures,
      0,
      "Existing utility regressions failed in the real extension host"
    );
  }
  await fs.writeFile(
    path.join(root, "host-passed.json"),
    JSON.stringify({ version: vscode.version, roundTrip: true })
  );
  console.log(
    "Real extension commands exported/imported synthetic settings and snippets without Gist credentials."
  );
};
