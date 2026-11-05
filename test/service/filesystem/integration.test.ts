import { strict as assert } from "assert";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join, resolve, sep } from "path";

describe("Filesystem sync with isolated VS Code API", () => {
  if (process.env.SETTINGS_SYNC_FILESYSTEM_TEST !== "1") {
    it("runs with npm run test-filesystem", function() {
      this.skip();
    });
    return;
  }
  const vscode = require("vscode");
  const { state } = require("../../../src/state");
  const { Sync } = require("../../../src/sync");
  const { LocalConfig } = require("../../../src/models/localConfig.model");
  const { SyncMethod } = require("../../../src/enums/syncMethod.enum");
  const { FactoryService } = require("../../../src/service/factory.service");
  const { FileService } = require("../../../src/service/file.service");
  const { WebviewService } = require("../../../src/service/webview.service");
  const Commons = require("../../../src/commons").default;
  const log = Commons.LogException;
  let root: string;
  let user: string;
  let share: string;
  let config: any;
  let saved: number;
  let savedGlobal: number;
  let errors: string[];
  const write = FileService.WriteFile;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), "settings-sync-integration-"));
    user = join(root, "User") + sep;
    share = join(root, "Share");
    await fs.mkdir(join(user, "snippets"), { recursive: true });
    await fs.writeFile(join(user, "settings.json"), '{"editor.fontSize":14}');
    await fs.writeFile(join(user, "snippets", "sample.json"), '{"sample":{}}');
    await fs.writeFile(
      join(user, "syncLocalSettings.json"),
      '{"token":"synthetic-local-only"}'
    );
    state.environment = {
      USER_FOLDER: user,
      FILE_CUSTOMIZEDSETTINGS: join(user, "syncLocalSettings.json"),
      FILE_CLOUDSETTINGS_NAME: "cloudSettings",
      FILE_SETTING_NAME: "settings.json",
      FILE_KEYBINDING_NAME: "keybindings.json",
      FILE_KEYBINDING_DEFAULT: "keybindings.json",
      FILE_KEYBINDING_MAC: "keybindingsMac.json",
      FILE_EXTENSION_NAME: "extensions.json",
      OsType: "win32",
      getVersion: () => "3.4.4"
    };
    state.context = {
      extensionPath: resolve(__dirname, "../../../../"),
      globalState: { get: () => false }
    };
    config = new LocalConfig();
    config.customConfig.syncMethod = SyncMethod.FileSystem;
    config.customConfig.fileSystem.folder = share;
    config.customConfig.githubSettings.token = "";
    config.customConfig.githubSettings.gistSettings.lastDownload = new Date(
      "2001-01-01"
    );
    config.extConfig.gist = "existing-test-gist";
    config.extConfig.forceUpload = true;
    config.extConfig.forceDownload = true;
    config.extConfig.syncExtensions = false;
    config.extConfig.quietSync = true;
    saved = 0;
    savedGlobal = 0;
    errors = [];
    Commons.LogException = (error: Error, message: string) =>
      errors.push(error ? error.message : message);
    state.commons = {
      ERROR_MESSAGE: "test failure",
      InitalizeSettings: async () => config,
      GetCustomSettings: async () => config.customConfig,
      SaveSettings: async () => {
        savedGlobal++;
        return true;
      },
      SetCustomSettings: async () => {
        saved++;
        return true;
      },
      webviewService: { OpenSettingsPage() {}, OpenLandingPage() {} }
    };
    state.watcher = {
      autoUploadService: { watching: true },
      HandleStopWatching: async () => {
        state.watcher.autoUploadService.watching = false;
      },
      HandleStartWatching: async () => {
        state.watcher.autoUploadService.watching = true;
      }
    };
  });

  afterEach(async () => {
    FileService.WriteFile = write;
    Commons.LogException = log;
    vscode.__folders = undefined;
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("settings-sync-integration-"));
    await require("fs-extra").remove(root);
  });

  it("routes existing commands through real files without Gist credentials or changing Gist state", async () => {
    const previous =
      config.customConfig.githubSettings.gistSettings.lastDownload;
    const sync = new Sync();
    await sync.upload();
    assert.deepEqual(errors, []);
    const bundle = await fs.readFile(join(share, "settings-sync.json"), "utf8");
    assert.ok(!bundle.includes("synthetic-local-only"));
    assert.ok(JSON.parse(bundle).files["snippets|sample.json"]);
    await fs.writeFile(join(user, "settings.json"), '{"editor.fontSize":20}');
    await fs.unlink(join(user, "snippets", "sample.json"));
    await sync.download();
    assert.deepEqual(errors, []);
    assert.equal(
      JSON.parse(await fs.readFile(join(user, "settings.json"), "utf8"))[
        "editor.fontSize"
      ],
      14
    );
    assert.ok(await fs.readFile(join(user, "snippets", "sample.json"), "utf8"));
    assert.equal(config.extConfig.gist, "existing-test-gist");
    assert.equal(
      config.customConfig.githubSettings.gistSettings.lastDownload,
      previous
    );
    assert.equal(state.watcher.autoUploadService.watching, true);
    assert.equal(savedGlobal, 0);
  });

  it("does not advance import history when a file write fails and restores watching", async () => {
    await new Sync().upload();
    const previous = config.customConfig.fileSystem.lastDownload;
    saved = 0;
    FileService.WriteFile = async () => false;
    await new Sync().download();
    assert.ok(errors.some(error => error.includes("Unable to import")));
    assert.equal(config.customConfig.fileSystem.lastDownload, previous);
    assert.equal(saved, 0);
    assert.equal(state.watcher.autoUploadService.watching, true);
  });

  it("rejects an export folder inside User without creating it", async () => {
    config.customConfig.fileSystem.folder = join(user, "nested", "Share");
    await new Sync().upload();
    assert.ok(errors.length > 0);
    await assert.rejects(fs.stat(join(user, "nested")), /ENOENT/);
    assert.equal(state.watcher.autoUploadService.watching, true);
  });

  it("rejects invalid imported paths before writing any settings", async () => {
    await fs.mkdir(share);
    await fs.writeFile(
      join(share, "settings-sync.json"),
      JSON.stringify({
        version: 1,
        files: { "..|outside.json": { content: "bad" } }
      })
    );
    await new Sync().download();
    assert.ok(errors.length > 0);
    assert.equal(
      await fs.readFile(join(user, "settings.json"), "utf8"),
      '{"editor.fontSize":14}'
    );
    assert.equal(saved, 0);
  });

  it("rejects linked import directories before writing any settings", async function() {
    await new Sync().upload();
    assert.deepEqual(errors, []);
    const outside = join(root, "Outside");
    await fs.mkdir(outside);
    await fs.writeFile(join(outside, "sample.json"), "external sentinel");
    await fs.unlink(join(user, "snippets", "sample.json"));
    await fs.rmdir(join(user, "snippets"));
    try {
      await fs.symlink(outside, join(user, "snippets"), "junction");
    } catch (error) {
      if (error.code === "EPERM") {
        this.skip();
        return;
      }
      throw error;
    }
    await fs.writeFile(join(user, "settings.json"), '{"editor.fontSize":20}');
    const savesBeforeImport = saved;
    const downloadBeforeImport = config.customConfig.fileSystem.lastDownload;
    await new Sync().download();
    assert.equal(
      await fs.readFile(join(outside, "sample.json"), "utf8"),
      "external sentinel"
    );
    assert.ok(
      errors.some(message => /symbolic link/i.test(message)),
      "Expected a linked-target rejection"
    );
    assert.equal(
      await fs.readFile(join(user, "settings.json"), "utf8"),
      '{"editor.fontSize":20}'
    );
    assert.equal(saved, savesBeforeImport);
    assert.equal(
      config.customConfig.fileSystem.lastDownload,
      downloadBeforeImport
    );
    assert.equal(state.watcher.autoUploadService.watching, true);
  });

  it("also preflights explicitly configured custom-file destinations", async function() {
    const outside = join(root, "Outside");
    const alias = join(root, "CustomAlias");
    await fs.mkdir(outside);
    await fs.writeFile(join(outside, "custom.json"), "custom sentinel");
    try {
      await fs.symlink(outside, alias, "junction");
    } catch (error) {
      if (error.code === "EPERM") {
        this.skip();
        return;
      }
      throw error;
    }
    config.customConfig.customFiles["custom.json"] = join(alias, "custom.json");
    await fs.mkdir(share);
    await fs.writeFile(
      join(share, "settings-sync.json"),
      JSON.stringify({
        version: 1,
        files: { "|customized_sync|custom.json": { content: "replacement" } }
      })
    );
    await new Sync().download();
    assert.ok(
      errors.some(message => /symbolic link/i.test(message)),
      "Expected custom target rejection"
    );
    assert.equal(
      await fs.readFile(join(outside, "custom.json"), "utf8"),
      "custom sentinel"
    );
    assert.equal(saved, 0);
  });

  it("keeps default Gist dispatch and refuses unknown providers", () => {
    const gist = FactoryService.CreateSyncService(state, SyncMethod.GitHubGist);
    assert.equal(gist.constructor.name, "GistService");
    assert.throws(() => FactoryService.CreateSyncService(state, "constructor"));
  });

  it("persists valid mode/folder UI changes and a cancelled folder picker is inert", async () => {
    const view = new WebviewService();
    view.ReceiveSettingChange(
      { command: "syncMethod", text: "invalid", type: "global" },
      config.customConfig,
      config.extConfig
    );
    assert.equal(config.customConfig.syncMethod, SyncMethod.FileSystem);
    config.customConfig.fileSystem.lastDownload = new Date("2002-01-01");
    view.ReceiveSettingChange(
      {
        command: "fileSystem.folder",
        text: join(root, "Other"),
        type: "global"
      },
      config.customConfig,
      config.extConfig
    );
    assert.equal(config.customConfig.fileSystem.lastDownload, null);
    const panel = view.OpenSettingsPage(config.customConfig, config.extConfig);
    const history = new Date("2003-01-01");
    config.customConfig.fileSystem.lastUpload = history;
    await panel.receive({ command: "chooseFileSystemFolder" });
    assert.equal(config.customConfig.fileSystem.lastUpload, history);
    assert.equal(config.customConfig.fileSystem.folder, join(root, "Other"));
    vscode.__folders = [{ fsPath: share }];
    await panel.receive({ command: "chooseFileSystemFolder" });
    assert.equal(config.customConfig.fileSystem.folder, share);
    assert.equal(config.customConfig.fileSystem.lastUpload, null);
    if (process.env.SETTINGS_SYNC_UI_OUTPUT) {
      await fs.writeFile(
        process.env.SETTINGS_SYNC_UI_OUTPUT,
        panel.webview.html
      );
    }
  });

  it("refuses public sharing while filesystem mode is active", async () => {
    await new Sync().upload("publicGIST");
    assert.equal(saved, 0);
    await assert.rejects(fs.stat(share), /ENOENT/);
  });

  it("honors explicit force export without an interactive first-export prompt", async () => {
    const prompt = vscode.window.showInformationMessage;
    vscode.window.showInformationMessage = async () => {
      throw new Error("Unexpected interactive force-export prompt");
    };
    try {
      await new Sync().upload();
      assert.deepEqual(errors, []);
      assert.ok(await fs.readFile(join(share, "settings-sync.json"), "utf8"));
    } finally {
      vscode.window.showInformationMessage = prompt;
    }
  });

  it("checks canonical folder containment before creating a new folder", async function() {
    const alias = join(root, "Alias");
    try {
      await fs.symlink(user, alias, "junction");
    } catch (error) {
      if (error.code === "EPERM") {
        this.skip();
        return;
      }
      throw error;
    }
    config.customConfig.fileSystem.folder = join(alias, "Nested");
    await new Sync().upload();
    assert.ok(errors.length > 0);
    await assert.rejects(fs.stat(join(user, "Nested")), /ENOENT/);
  });
});
