"use strict";

const assert = require("assert").strict;
const path = require("path");
const fs = require("fs").promises;
const os = require("os");
const vscode = require("vscode");

exports.run = async function() {
  const root = path.resolve(process.env.SETTINGS_SYNC_EDITOR_ROOT || "");
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith("settings-sync-editor-"));
  assert.equal(
    vscode.workspace.getConfiguration("sync").get("gist"),
    path.basename(root),
    "Not the isolated profile"
  );
  const { FileService } = require("../out/src/service/file.service");
  let passed = 0;
  const failures = [];
  async function check(name, action) {
    try {
      await action();
      passed++;
      console.log("PASS " + name);
    } catch (error) {
      failures.push(name);
      console.error("FAIL " + name, error);
    }
  }
  async function open(name) {
    const filename = path.join(root, name);
    await fs.writeFile(filename, '{"value":"before"}');
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(filename)
    );
    const editor = await vscode.window.showTextDocument(document);
    return { filename, document, editor };
  }
  await check(
    "clean editor and disk are synchronized when write resolves",
    async () => {
      const { filename, document } = await open("clean.json");
      assert.equal(
        await FileService.WriteFile(filename, '{"value":"downloaded"}'),
        true
      );
      assert.equal(document.getText(), '{"value":"downloaded"}');
      assert.equal(
        await fs.readFile(filename, "utf8"),
        '{"value":"downloaded"}'
      );
      assert.equal(document.isDirty, false);
    }
  );
  await check("unsaved edits do not get overwritten or discarded", async () => {
    const { filename, document, editor } = await open("dirty.json");
    await editor.edit(edit => edit.insert(new vscode.Position(0, 0), " "));
    const unsaved = document.getText();
    const accepted = await FileService.WriteFile(
      filename,
      '{"value":"downloaded"}'
    );
    assert.equal(await fs.readFile(filename, "utf8"), '{"value":"before"}');
    assert.equal(document.getText(), unsaved);
    assert.equal(document.isDirty, true);
    assert.equal(accepted, false);
  });
  await check("closed files retain normal file writes", async () => {
    const filename = path.join(root, "closed.json");
    assert.equal(await FileService.WriteFile(filename, '{"value":1}'), true);
    assert.equal(await fs.readFile(filename, "utf8"), '{"value":1}');
  });
  async function importSettings(dirty) {
    const folder = path.join(root, dirty ? "DirtyUser" : "CleanUser");
    await fs.mkdir(folder);
    const filename = path.join(folder, "settings.json");
    await fs.writeFile(filename, '{"value":"before"}');
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(filename)
    );
    const editor = await vscode.window.showTextDocument(document);
    if (dirty)
      await editor.edit(edit => edit.insert(new vscode.Position(0, 0), " "));
    const beforeText = document.getText();
    const { GistService } = require("../out/src/service/github/gist.service");
    const {
      GitHubService
    } = require("../out/src/service/github/github.service");
    const { LocalConfig } = require("../out/src/models/localConfig.model");
    const Commons = require("../out/src/commons").default;
    const globalState = require("../out/src/state").state;
    const environment = globalState.environment;
    globalState.environment = {
      getVersion: () => require("../package.json").version
    };
    const config = new LocalConfig();
    config.extConfig.gist = "synthetic-fixture-only";
    config.extConfig.forceDownload = true;
    config.extConfig.syncExtensions = false;
    config.extConfig.quietSync = true;
    config.customConfig.githubSettings.token = "";
    config.customConfig.githubSettings.enterpriseUrl =
      "http://127.0.0.1:1/no-network";
    config.customConfig.githubSettings.gistSettings.downloadPublicGist = true;
    const beforeDate = new Date("2001-01-01");
    config.customConfig.githubSettings.gistSettings.lastDownload = beforeDate;
    const remoteDate = "2011-01-01T00:00:00.000Z";
    let saves = 0;
    const errors = [];
    const watcher = {
      autoUploadService: { watching: true },
      HandleStopWatching: async () => {
        watcher.autoUploadService.watching = false;
      },
      HandleStartWatching: async () => {
        watcher.autoUploadService.watching = true;
      }
    };
    const state = {
      watcher,
      environment: {
        USER_FOLDER: folder + path.sep,
        FILE_CLOUDSETTINGS_NAME: "cloudSettings",
        FILE_EXTENSION_NAME: "extensions.json",
        FILE_SETTING_NAME: "settings.json",
        FILE_KEYBINDING_DEFAULT: "keybindings.json",
        FILE_KEYBINDING_MAC: "keybindingsMac.json",
        OsType: "win32"
      },
      commons: {
        ERROR_MESSAGE: "synthetic test failure",
        InitalizeSettings: async () => config,
        SaveSettings: async () => {
          saves++;
          return true;
        },
        SetCustomSettings: async () => {
          saves++;
          return true;
        }
      }
    };
    const read = GitHubService.prototype.ReadGist;
    const log = Commons.LogException;
    GitHubService.prototype.ReadGist = async () => ({
      data: {
        public: false,
        files: {
          cloudSettings: {
            content: JSON.stringify({ lastUpload: remoteDate })
          },
          "settings.json": { content: '{"value":"downloaded"}' }
        }
      }
    });
    Commons.LogException = error => errors.push(error.message);
    try {
      await new GistService(state).Import();
      if (dirty) {
        assert.equal(await fs.readFile(filename, "utf8"), '{"value":"before"}');
        assert.equal(document.getText(), beforeText);
        assert.equal(
          config.customConfig.githubSettings.gistSettings.lastDownload,
          beforeDate
        );
        assert.equal(saves, 0);
        assert.ok(
          errors.some(message => message.includes("could not be saved")),
          JSON.stringify(errors)
        );
      } else {
        assert.equal(JSON.parse(document.getText()).value, "downloaded");
        assert.equal(
          JSON.parse(await fs.readFile(filename, "utf8")).value,
          "downloaded"
        );
        assert.equal(document.isDirty, false);
        assert.equal(
          config.customConfig.githubSettings.gistSettings.lastDownload,
          remoteDate
        );
        assert.equal(saves, 2);
        assert.deepEqual(errors, []);
      }
      assert.equal(watcher.autoUploadService.watching, true);
    } finally {
      GitHubService.prototype.ReadGist = read;
      Commons.LogException = log;
      globalState.environment = environment;
    }
  }
  await check(
    "Gist import rejects dirty settings without history/persistence and restores watching",
    () => importSettings(true)
  );
  await check(
    "Gist import updates an open clean settings document before recording history",
    () => importSettings(false)
  );
  await check(
    "the actual VS Code settings JSON resource is synchronized",
    async () => {
      await vscode.commands.executeCommand("workbench.action.openSettingsJson");
      const editor = vscode.window.activeTextEditor;
      assert.ok(editor, "Settings JSON editor did not open");
      const document = editor.document;
      const filename = path.join(root, "portable/user-data/User/settings.json");
      assert.equal(
        path.resolve(document.uri.fsPath).toLowerCase(),
        path.resolve(filename).toLowerCase()
      );
      console.log("Settings document scheme: " + document.uri.scheme);
      const data = JSON.stringify({
        ...JSON.parse(document.getText()),
        "editor.fontSize": 17
      });
      assert.equal(await FileService.WriteFile(filename, data), true);
      assert.equal(JSON.parse(document.getText())["editor.fontSize"], 17);
      assert.equal(document.isDirty, false);
      assert.equal(
        JSON.parse(await fs.readFile(filename, "utf8"))["editor.fontSize"],
        17
      );
      await editor.edit(edit => edit.insert(new vscode.Position(0, 0), " "));
      const unsaved = document.getText();
      assert.equal(
        await FileService.WriteFile(filename, '{"editor.fontSize":21}'),
        false
      );
      assert.equal(document.getText(), unsaved);
      assert.equal(document.isDirty, true);
      assert.equal(
        JSON.parse(await fs.readFile(filename, "utf8"))["editor.fontSize"],
        17
      );
    }
  );
  assert.deepEqual(failures, [], "Editor regression failures");
  await fs.writeFile(
    path.join(root, "passed.json"),
    JSON.stringify({ version: vscode.version, passed })
  );
};
