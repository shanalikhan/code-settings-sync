import "./filesystem-host";
import { host } from "./filesystem-host";
import * as assert from "assert";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as vm from "vm";
import { WebviewService } from "../src/service/webview.service";
import { SyncMethod } from "../src/enums/syncMethod.enum";
import { OsType } from "../src/enums/osType.enum";
import { CustomConfig } from "../src/models/customConfig.model";
import { ExtensionConfig } from "../src/models/extensionConfig.model";
import { LocalConfig } from "../src/models/localConfig.model";
import { state } from "../src/state";
import { Sync } from "../src/sync";
import { FactoryService } from "../src/service/factory.service";
import { FileSystemService } from "../src/service/filesystem/filesystem.service";
import {
  destinationKey,
  FileSystemStore,
  parseSnapshot,
  Snapshot
} from "../src/service/filesystem/store";
import { GistService } from "../src/service/github/gist.service";

describe("Filesystem sync", () => {
  let root: string;
  let config: LocalConfig;
  let service: FileSystemService;
  let store: FileSystemStore;
  let started: number;
  let stopped: number;
  let saved: number;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "settings-sync-"));
    const user = path.join(root, "machine-a", "User") + path.sep;
    await fs.ensureDir(user);
    state.environment = {
      USER_FOLDER: user,
      FILE_SETTING_NAME: "settings.json",
      FILE_KEYBINDING_NAME: "keybindings.json",
      FILE_KEYBINDING_DEFAULT: "keybindings.json",
      FILE_KEYBINDING_MAC: "keybindingsMac.json",
      FILE_EXTENSION_NAME: "extensions.json",
      FILE_CUSTOMIZEDSETTINGS_NAME: "syncLocalSettings.json",
      FILE_CUSTOMIZEDSETTINGS: path.join(user, "syncLocalSettings.json"),
      OsType: OsType.Linux,
      getVersion: () => "3.4.4"
    } as any;
    state.context = { extensionPath: path.resolve(__dirname, "../..") } as any;
    config = new LocalConfig();
    config.customConfig = new CustomConfig();
    config.customConfig.syncMethod = SyncMethod.FileSystem;
    config.customConfig.fileSystemPath = path.join(root, "backup");
    config.extConfig = new ExtensionConfig();
    config.extConfig.syncExtensions = false;
    config.extConfig.forceDownload = true;
    config.extConfig.autoUpload = true;
    started = stopped = saved = 0;
    state.commons = {
      ERROR_MESSAGE: "Sync failed",
      InitalizeSettings: async () => config,
      GetCustomSettings: async () => config.customConfig,
      GetSettings: () => config.extConfig,
      SaveSettings: async () => {
        saved++;
        return true;
      },
      SetCustomSettings: async () => true,
      webviewService: {
        OpenLandingPage: () => {
          throw new Error("Unexpected GitHub login");
        }
      }
    } as any;
    state.watcher = {
      HandleStartWatching: async () => {
        started++;
      },
      HandleStopWatching: async () => {
        stopped++;
      }
    } as any;
    host.prompts = [];
    host.commands = [];
    host.errors = [];
    host.extensions = [];
    host.answer = undefined;
    service = new FileSystemService(state);
    store = new FileSystemStore(config.customConfig.fileSystemPath);
    await fs.writeFile(
      state.environment.FILE_CUSTOMIZEDSETTINGS,
      '{"token":"never-export-this"}'
    );
  });

  afterEach(async () => {
    await fs.remove(root);
  });
  const snapshot = (files: Snapshot["files"]): Snapshot => ({
    version: 1,
    files
  });

  it("routes existing commands to filesystem storage without GitHub credentials", async () => {
    await fs.writeFile(
      path.join(state.environment.USER_FOLDER, "settings.json"),
      '{"editor.fontSize":19}'
    );
    await new Sync().upload();
    const original = await store.read();
    assert.ok(original);
    assert.ok(!original.includes("never-export-this"));
    await fs.writeFile(
      path.join(state.environment.USER_FOLDER, "settings.json"),
      "{}"
    );
    await new Sync().download();
    const restoredSettings = JSON.parse(
      await fs.readFile(
        path.join(state.environment.USER_FOLDER, "settings.json"),
        "utf8"
      )
    );
    assert.strictEqual(restoredSettings["editor.fontSize"], 19);
    for (const key of Object.keys(config.extConfig)) {
      assert.strictEqual(
        restoredSettings["sync." + key],
        config.extConfig[key] == null ? "" : config.extConfig[key]
      );
    }
    assert.deepStrictEqual(host.errors, []);
    assert.strictEqual(saved, 1);
    assert.strictEqual(started, 2);
    assert.strictEqual(stopped, 2);
  });

  it("retains the existing Gist factory and rejects unknown storage methods", () => {
    assert.ok(
      FactoryService.CreateSyncService(state, SyncMethod.GitHubGist) instanceof
        GistService
    );
    assert.ok(
      FactoryService.CreateSyncService(state, SyncMethod.FileSystem) instanceof
        FileSystemService
    );
    assert.throws(
      () => FactoryService.CreateSyncService(state, "constructor"),
      /Unknown sync method/
    );
  });

  it("round-trips nested snippets, empty files, and custom files to a second user folder", async () => {
    await fs.outputFile(
      path.join(
        state.environment.USER_FOLDER,
        "snippets",
        "nested",
        "a.code-snippets"
      ),
      '{"a":1}'
    );
    await fs.writeFile(
      path.join(state.environment.USER_FOLDER, "empty.json"),
      ""
    );
    const customSource = path.join(root, "dotfile");
    await fs.writeFile(customSource, "custom");
    config.customConfig.customFiles = { rc: customSource };
    await service.Export();
    const second = path.join(root, "machine-b", "User") + path.sep;
    await fs.ensureDir(second);
    state.environment.USER_FOLDER = second;
    state.environment.FILE_CUSTOMIZEDSETTINGS = path.join(
      second,
      "syncLocalSettings.json"
    );
    config.customConfig.customFiles.rc = path.join(root, "second-dotfile");
    await service.Import();
    assert.strictEqual(
      await fs.readFile(
        path.join(second, "snippets/nested/a.code-snippets"),
        "utf8"
      ),
      '{"a":1}'
    );
    assert.strictEqual(
      await fs.readFile(path.join(second, "empty.json"), "utf8"),
      ""
    );
    assert.strictEqual(
      await fs.readFile(config.customConfig.customFiles.rc, "utf8"),
      "custom"
    );
    assert.strictEqual(
      await fs.pathExists(path.join(second, "syncLocalSettings.json")),
      false
    );
  });

  it("cancels replacement and restores auto export watching", async () => {
    await store.write(snapshot({ "settings.json": "old" }), null);
    await fs.writeFile(
      path.join(state.environment.USER_FOLDER, "settings.json"),
      "new"
    );
    const before = await store.read();
    await service.Export();
    assert.strictEqual(await store.read(), before);
    assert.strictEqual(host.prompts.length, 1);
    assert.strictEqual(started, 1);
  });

  it("cancels import before changing any local file or extension", async () => {
    await store.write(snapshot({ "settings.json": '{"remote":true}' }), null);
    await fs.writeFile(
      path.join(state.environment.USER_FOLDER, "settings.json"),
      '{"local":true}'
    );
    config.extConfig.forceDownload = false;
    await service.Import();
    assert.strictEqual(
      await fs.readFile(
        path.join(state.environment.USER_FOLDER, "settings.json"),
        "utf8"
      ),
      '{"local":true}'
    );
    assert.strictEqual(stopped, 0);
    assert.deepStrictEqual(host.commands, []);
  });

  it("replaces removed snapshot files while leaving unrelated folder contents intact", async () => {
    await store.write(snapshot({ "gone.json": "old" }), null);
    await fs.writeFile(path.join(store.folder, "unrelated.txt"), "keep");
    config.extConfig.forceUpload = true;
    await fs.writeFile(
      path.join(state.environment.USER_FOLDER, "settings.json"),
      "new"
    );
    await service.Export();
    assert.deepStrictEqual(parseSnapshot(await store.read()).files, {
      "settings.json": "new"
    });
    assert.strictEqual(
      await fs.readFile(path.join(store.folder, "unrelated.txt"), "utf8"),
      "keep"
    );
  });

  it("does not rewrite identical snapshots or prompt again", async () => {
    await fs.writeFile(
      path.join(state.environment.USER_FOLDER, "settings.json"),
      "same"
    );
    await service.Export();
    const stat = await fs.stat(store.filename);
    await service.Export();
    assert.strictEqual((await fs.stat(store.filename)).mtimeMs, stat.mtimeMs);
    assert.strictEqual(host.prompts.length, 0);
  });

  it("rejects invalid data before importing an otherwise valid first file", async () => {
    await fs.ensureDir(store.folder);
    await fs.writeFile(
      store.filename,
      JSON.stringify(
        snapshot({ "settings.json": "new", "..|escape.json": "evil" })
      )
    );
    await fs.writeFile(
      path.join(state.environment.USER_FOLDER, "settings.json"),
      "old"
    );
    await assert.rejects(
      service.Import(),
      /Invalid settings snapshot filename/
    );
    assert.strictEqual(
      await fs.readFile(
        path.join(state.environment.USER_FOLDER, "settings.json"),
        "utf8"
      ),
      "old"
    );
    assert.strictEqual(saved, 0);
  });

  it("rejects unsupported snapshots, absolute paths, reserved names and non-text files", () => {
    for (const name of [
      "/tmp/x",
      "a\\b",
      "C:x",
      "a|..|x",
      ".. |escape.json",
      "foo. |escape.json",
      "CON.json",
      "a?b.json",
      "__proto__",
      "syncLocalSettings.json",
      "globalStorage|x.json",
      "GlobalStorage|x.json",
      "SyncLocalSettings.JSON"
    ]) {
      assert.throws(
        () =>
          parseSnapshot(
            '{"version":1,"files":{' + JSON.stringify(name) + ':"x"}}'
          ),
        /Invalid settings snapshot filename/
      );
    }
    assert.throws(
      () => parseSnapshot('{"version":2,"files":{}}'),
      /Unsupported/
    );
    assert.throws(
      () => parseSnapshot('{"version":1,"files":{"x.json":3}}'),
      /Invalid settings snapshot content/
    );
    assert.throws(() => new FileSystemStore("relative"), /absolute/);
  });

  it("normalizes duplicate Windows destinations while preserving Linux casing", () => {
    assert.strictEqual(
      destinationKey("C:\\User\\Settings.json", "win32"),
      destinationKey("c:\\user\\settings.JSON", "win32")
    );
    assert.notStrictEqual(
      destinationKey("/User/Settings.json", "linux"),
      destinationKey("/User/settings.json", "linux")
    );
  });

  it("rejects nested backup folders, including aliases through symlinks", async () => {
    config.customConfig.fileSystemPath = path.join(
      state.environment.USER_FOLDER,
      "backup"
    );
    await assert.rejects(service.Export(), /outside/);
    const alias = path.join(root, "alias");
    await fs.symlink(state.environment.USER_FOLDER, alias, "dir");
    config.customConfig.fileSystemPath = path.join(alias, "backup");
    await assert.rejects(service.Export(), /outside/);
  });

  it("refuses import paths escaping through user-directory symlinks", async () => {
    const outside = path.join(root, "outside");
    await fs.ensureDir(outside);
    await fs.symlink(
      outside,
      path.join(state.environment.USER_FOLDER, "snippets"),
      "dir"
    );
    await store.write(snapshot({ "snippets|escape.json": "x" }), null);
    await assert.rejects(service.Import(), /outside/);
    assert.strictEqual(
      await fs.pathExists(path.join(outside, "escape.json")),
      false
    );
  });

  it("detects changed backups and concurrent writers without truncating the snapshot", async () => {
    await store.write(snapshot({ "x.json": "a" }), null);
    const old = await store.read();
    await store.write(snapshot({ "x.json": "b" }), old);
    await assert.rejects(
      store.write(snapshot({ "x.json": "c" }), old),
      /changed/
    );
    await fs.writeFile(
      path.join(store.folder, ".settings-sync.lock"),
      "locked"
    );
    await assert.rejects(
      store.write(snapshot({ "x.json": "c" }), await store.read()),
      /EEXIST/
    );
    assert.strictEqual(parseSnapshot(await store.read()).files["x.json"], "b");
  });

  it("rejects a symlinked snapshot instead of overwriting its target", async () => {
    const outside = path.join(root, "outside.json");
    await fs.writeFile(outside, "unchanged");
    await fs.ensureDir(store.folder);
    await fs.symlink(outside, store.filename);
    await assert.rejects(service.Export(), /regular file/);
    assert.strictEqual(await fs.readFile(outside, "utf8"), "unchanged");
    assert.strictEqual(started, 1);
  });

  it("preserves opposite-platform keybindings and imports the local platform variant", async () => {
    await store.write(
      snapshot({ "keybindings.json": "linux", "keybindingsMac.json": "mac" }),
      null
    );
    await fs.writeFile(
      path.join(state.environment.USER_FOLDER, "keybindings.json"),
      "linux-new"
    );
    config.extConfig.forceUpload = true;
    await service.Export();
    assert.strictEqual(
      parseSnapshot(await store.read()).files["keybindingsMac.json"],
      "mac"
    );
    state.environment.OsType = OsType.Mac;
    await service.Import();
    assert.strictEqual(
      await fs.readFile(
        path.join(state.environment.USER_FOLDER, "keybindings.json"),
        "utf8"
      ),
      "mac"
    );
  });

  it("uses local custom mappings only and rejects duplicate or credential destinations", async () => {
    await store.write(
      snapshot({ "|customized_sync|unknown": "ignored" }),
      null
    );
    await service.Import();
    assert.strictEqual(
      await fs.pathExists(path.join(state.environment.USER_FOLDER, "unknown")),
      false
    );
    await store.write(
      snapshot({ "|customized_sync|secret": "x" }),
      await store.read()
    );
    config.customConfig.customFiles.secret =
      state.environment.FILE_CUSTOMIZEDSETTINGS;
    await assert.rejects(service.Import(), /reserved/);
  });

  it("synchronizes extension inventory via the existing plugin service", async () => {
    config.extConfig.syncExtensions = true;
    host.extensions = [
      {
        id: "sample.tool",
        packageJSON: { name: "tool", publisher: "sample", version: "1.0" }
      }
    ];
    await service.Export();
    host.extensions = [];
    await service.Import();
    assert.deepStrictEqual(host.commands, [
      ["workbench.extensions.installExtension", "sample.tool"]
    ]);
  });
  it("renders Windows paths and script-like settings safely, and saves mode selection", async () => {
    const special = 'C:\\Users\\person\\${globalThis.injected=true}`</script>"';
    config.customConfig.fileSystemPath = special;
    const webviews = new WebviewService();
    const panel = webviews.OpenSettingsPage(
      config.customConfig,
      config.extConfig
    );
    const html = panel.webview.html;
    const script = html.match(
      /<script defer>\s*(const globalData[\s\S]*?)<\/script>/
    )[1];
    const sandbox: any = {};
    const rendered = vm.runInNewContext(script + "\nglobalData", sandbox);
    assert.strictEqual(rendered.fileSystemPath, special);
    assert.strictEqual(sandbox.injected, undefined);
    host.messageHandler({
      command: "syncMethod",
      text: SyncMethod.GitHubGist,
      type: "global"
    });
    assert.strictEqual(config.customConfig.syncMethod, SyncMethod.GitHubGist);
    host.messageHandler({
      command: "syncMethod",
      text: "constructor",
      type: "global"
    });
    assert.strictEqual(config.customConfig.syncMethod, SyncMethod.GitHubGist);
  });

  it("preserves local sync options when a custom file maps to settings.json", async () => {
    config.customConfig.customFiles.profile = path.join(
      state.environment.USER_FOLDER,
      "settings.json"
    );
    config.extConfig.gist = "local-profile";
    config.extConfig.quietSync = false;
    const files = {
      "|customized_sync|profile":
        '{"editor.fontSize":23,"sync.gist":"remote","sync.quietSync":true}'
    };
    await store.write(snapshot(files), null);
    await service.Import();
    const settings = JSON.parse(
      await fs.readFile(
        path.join(state.environment.USER_FOLDER, "settings.json"),
        "utf8"
      )
    );
    assert.strictEqual(settings["editor.fontSize"], 23);
    assert.strictEqual(settings["sync.gist"], "local-profile");
    assert.strictEqual(settings["sync.quietSync"], false);
  });

  it("rejects invalid imported settings before writing any destination", async () => {
    const snippet = path.join(
      state.environment.USER_FOLDER,
      "snippets",
      "before.json"
    );
    await fs.outputFile(snippet, "original");
    const files = {
      "snippets|before.json": "changed",
      "settings.json": '{"sync.gist":'
    };
    await store.write(snapshot(files), null);
    await assert.rejects(service.Import(), /valid JSONC object/);
    assert.strictEqual(await fs.readFile(snippet, "utf8"), "original");
  });
});
