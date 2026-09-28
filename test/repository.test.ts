import "./filesystem-host";
import { host } from "./filesystem-host";
import * as assert from "assert";
import { execFileSync } from "child_process";
import * as fs from "fs-extra";
import * as https from "https";
import { AddressInfo } from "net";
import * as os from "os";
import * as path from "path";
import * as vm from "vm";
import { OsType } from "../src/enums/osType.enum";
import { SyncMethod } from "../src/enums/syncMethod.enum";
import { LocalConfig } from "../src/models/localConfig.model";
import { FactoryService } from "../src/service/factory.service";
import { FileService } from "../src/service/file.service";
import { GitRepositoryService } from "../src/service/git/git.service";
import { createRepository } from "../src/service/git/provider";
import { destinationKey, parseSnapshot } from "../src/service/git/store";
import {
  GitTransport,
  MAX_SNAPSHOT_BYTES,
  gitEnvironment,
  providerUrl,
  validateRemote
} from "../src/service/git/transport";
import { GistService } from "../src/service/github/gist.service";
import { WebviewService } from "../src/service/webview.service";
import { state } from "../src/state";
import { Sync } from "../src/sync";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@localhost",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@localhost"
    }
  }).trim();
const document = (files: { [name: string]: string }) =>
  JSON.stringify({ version: 1, files });

describe("Git repository sync", function() {
  this.timeout(20000);
  let root: string;
  let config: LocalConfig;
  let service: GitRepositoryService;
  let starts: number;
  let stops: number;
  let saved: number;
  const userFile = (name: string) =>
    path.join(state.environment.USER_FOLDER, name);
  const current = () =>
    git(
      config.customConfig.gitRepository.remote,
      "rev-parse",
      "refs/heads/" + config.customConfig.gitRepository.branch
    );
  const readSnapshot = () =>
    parseSnapshot(
      git(
        config.customConfig.gitRepository.remote,
        "show",
        "refs/heads/" +
          config.customConfig.gitRepository.branch +
          ":settings-sync.json"
      )
    );
  const publish = async (text: string) => {
    const transport = new GitTransport(config.customConfig.gitRepository);
    try {
      await transport.open();
      await transport.push(text);
    } finally {
      await transport.close();
    }
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "sync-git-test-"));
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
    config.customConfig.syncMethod = SyncMethod.GitRepository;
    config.customConfig.gitRepository.remote = path.join(root, "remote.git");
    config.extConfig.syncExtensions = false;
    config.extConfig.forceUpload = true;
    config.extConfig.forceDownload = true;
    config.extConfig.autoUpload = true;
    git(root, "init", "--bare", config.customConfig.gitRepository.remote);
    starts = stops = saved = 0;
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
          throw new Error("Unexpected login");
        }
      }
    } as any;
    state.watcher = {
      HandleStartWatching: async () => {
        starts++;
      },
      HandleStopWatching: async () => {
        stops++;
      }
    } as any;
    host.answer = undefined;
    host.prompts = [];
    host.errors = [];
    host.commands = [];
    host.extensions = [];
    service = new GitRepositoryService(state);
    await fs.writeFile(
      state.environment.FILE_CUSTOMIZEDSETTINGS,
      '{"token":"private-token"}'
    );
  });
  afterEach(async () => {
    await fs.remove(root);
  });

  it("routes production commands through real Git, excludes credentials and restores nested/empty files", async () => {
    await fs.writeFile(userFile("settings.json"), '{"editor.fontSize":19}');
    await fs.outputFile(userFile("snippets/typescript.json"), "");
    await new Sync().upload();
    assert.deepStrictEqual(readSnapshot().files, {
      "settings.json": '{"editor.fontSize":19}',
      "snippets|typescript.json": ""
    });
    await fs.writeFile(userFile("settings.json"), "{}");
    await fs.remove(userFile("snippets"));
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
    assert.strictEqual(
      await fs.readFile(userFile("snippets/typescript.json"), "utf8"),
      ""
    );
    assert.strictEqual(saved, 1);
    assert.strictEqual(starts, 2);
    assert.strictEqual(stops, 2);
    assert.deepStrictEqual(host.errors, []);
  });

  it("isolates branch profiles and leaves unchanged exports without another commit", async () => {
    await fs.writeFile(userFile("settings.json"), '{"profile":"home"}');
    await service.Export();
    const home = current();
    await service.Export();
    assert.strictEqual(current(), home);
    config.customConfig.gitRepository.branch = "office";
    await fs.writeFile(userFile("settings.json"), '{"profile":"office"}');
    await service.Export();
    const office = current();
    assert.notStrictEqual(office, home);
    config.customConfig.gitRepository.branch = "master";
    await service.Import();
    assert.strictEqual(
      JSON.parse(await fs.readFile(userFile("settings.json"), "utf8")).profile,
      "home"
    );
    assert.strictEqual(current(), home);
  });

  it("preserves unrelated remote files and advances history from the fetched commit", async () => {
    const checkout = path.join(root, "seed");
    await fs.ensureDir(checkout);
    git(checkout, "init");
    await fs.writeFile(path.join(checkout, "README.md"), "keep");
    git(checkout, "add", "README.md");
    git(checkout, "commit", "-m", "initial");
    git(
      checkout,
      "push",
      config.customConfig.gitRepository.remote,
      "HEAD:master"
    );
    const previous = current();
    await fs.writeFile(userFile("settings.json"), "{}");
    await service.Export();
    assert.strictEqual(
      git(config.customConfig.gitRepository.remote, "show", "master:README.md"),
      "keep"
    );
    assert.strictEqual(
      git(config.customConfig.gitRepository.remote, "rev-parse", "master^"),
      previous
    );
  });

  it("rejects a concurrent branch update with a real force-with-lease push", async () => {
    await publish(document({ "settings.json": "first" }));
    const left = new GitTransport(config.customConfig.gitRepository);
    const right = new GitTransport(config.customConfig.gitRepository);
    try {
      await left.open();
      await right.open();
      await right.push(document({ "settings.json": "right" }));
      await assert.rejects(
        left.push(document({ "settings.json": "left" })),
        /Git push failed/
      );
      assert.strictEqual(readSnapshot().files["settings.json"], "right");
    } finally {
      await left.close();
      await right.close();
    }
  });

  it("rejects oversized uploads before changing the remote and diagnoses oversized existing snapshots", async () => {
    await publish(document({ "settings.json": "original" }));
    const original = current();
    const oversized = document({
      "settings.json": "x".repeat(MAX_SNAPSHOT_BYTES)
    });
    await assert.rejects(publish(oversized), /exceeds 8 MiB/);
    assert.strictEqual(current(), original);
    assert.strictEqual(readSnapshot().files["settings.json"], "original");
    const seed = path.join(root, "oversized");
    await fs.ensureDir(seed);
    git(seed, "init");
    await fs.writeFile(path.join(seed, "settings-sync.json"), oversized);
    git(seed, "add", "settings-sync.json");
    git(seed, "commit", "-m", "external oversized snapshot");
    git(
      seed,
      "push",
      "--force",
      config.customConfig.gitRepository.remote,
      "HEAD:master"
    );
    await assert.rejects(service.Import(), /Reduce it in the repository/);
    assert.strictEqual(saved, 0);
  });

  it("honors upload/download cancellation and resumes automatic watching", async () => {
    await publish(document({ "settings.json": '{"before":true}' }));
    const before = current();
    await fs.writeFile(userFile("settings.json"), '{"after":true}');
    config.extConfig.forceUpload = false;
    config.extConfig.forceDownload = false;
    await service.Export();
    await service.Import();
    assert.strictEqual(current(), before);
    assert.strictEqual(
      await fs.readFile(userFile("settings.json"), "utf8"),
      '{"after":true}'
    );
    assert.strictEqual(starts, 2);
    assert.strictEqual(saved, 0);
  });

  it("validates the whole remote snapshot before mutating any local file", async () => {
    await fs.writeFile(userFile("settings.json"), "before");
    for (const name of [
      "..|escape.json",
      "GlobalStorage|x.json",
      "SyncLocalSettings.JSON",
      ".git|config",
      ".. |x.json",
      "CON.json"
    ]) {
      await publish(document({ "settings.json": "after", [name]: "bad" }));
      await assert.rejects(
        service.Import(),
        /Invalid settings snapshot filename/
      );
      assert.strictEqual(
        await fs.readFile(userFile("settings.json"), "utf8"),
        "before"
      );
    }
    assert.strictEqual(saved, 0);
    assert.strictEqual(
      destinationKey("C:\\User\\settings.JSON", "win32"),
      destinationKey("c:\\user\\settings.json", "win32")
    );
  });

  it("rejects user-folder symlink escapes and custom mappings to local credentials", async () => {
    const outside = path.join(root, "outside");
    await fs.ensureDir(outside);
    await fs.symlink(outside, userFile("snippets"), "dir");
    await publish(document({ "snippets|escape.json": "bad" }));
    await assert.rejects(service.Import(), /outside the user folder/);
    config.customConfig.customFiles.secret =
      state.environment.FILE_CUSTOMIZEDSETTINGS;
    await publish(document({ "|customized_sync|secret": "bad" }));
    await assert.rejects(service.Import(), /reserved/);
  });

  it("keeps opposite-platform keybindings and sends extension inventories to the existing plugin service", async () => {
    await publish(document({ "keybindingsMac.json": "mac" }));
    await fs.writeFile(userFile("keybindings.json"), "[]");
    config.extConfig.syncExtensions = true;
    host.extensions = [
      {
        id: "sample.tool",
        packageJSON: { name: "tool", publisher: "sample", version: "1.0" }
      }
    ];
    await service.Export();
    assert.strictEqual(readSnapshot().files["keybindingsMac.json"], "mac");
    host.extensions = [];
    await service.Import();
    assert.deepStrictEqual(host.commands, [
      ["workbench.extensions.installExtension", "sample.tool"]
    ]);
  });

  it("never scans .git metadata, including when an old Gist configuration has no folder exclusions", async () => {
    config.customConfig.ignoreUploadFolders = [];
    await fs.outputFile(userFile(".git/private.json"), "secret");
    await fs.writeFile(userFile("settings.json"), "{}");
    assert.deepStrictEqual(
      (
        await FileService.ListFiles(
          state.environment.USER_FOLDER,
          config.customConfig
        )
      ).map(file => file.fileName),
      ["settings.json"]
    );
    assert.ok(
      FactoryService.CreateSyncService(state, SyncMethod.GitHubGist) instanceof
        GistService
    );
    assert.ok(
      FactoryService.CreateSyncService(
        state,
        SyncMethod.GitRepository
      ) instanceof GitRepositoryService
    );
    assert.throws(
      () => FactoryService.CreateSyncService(state, "constructor"),
      /Unknown/
    );
  });

  it("clears the operation guard after initialization failures and reports a missing profile", async () => {
    state.commons.InitalizeSettings = async () => {
      throw new Error("init failed");
    };
    await assert.rejects(service.Import(), /init failed/);
    state.commons.InitalizeSettings = async () => config;
    await assert.rejects(service.Import(), /Upload settings first/);
    assert.strictEqual(starts, 1);
  });

  it("persists profile/provider controls and safely decodes actual settings HTML", async () => {
    config.customConfig.gitRepository.remote =
      'C:\\Users\\${globalThis.injected=true}`</script>"';
    const view = new WebviewService();
    const panel = view.OpenSettingsPage(config.customConfig, config.extConfig);
    const script = panel.webview.html.match(
      /<script defer>\s*(const globalData[\s\S]*?)<\/script>/
    )[1];
    const sandbox: any = {};
    const data = vm.runInNewContext(script + "\nglobalData", sandbox);
    assert.strictEqual(
      data.gitRepository.remote,
      config.customConfig.gitRepository.remote
    );
    assert.strictEqual(sandbox.injected, undefined);
    await host.messageHandler({
      command: "gitRepository.branch",
      text: "office",
      type: "global"
    });
    assert.strictEqual(config.customConfig.gitRepository.branch, "office");
    await host.messageHandler({
      command: "gitRepository.branch",
      text: "true",
      type: "global"
    });
    assert.strictEqual(config.customConfig.gitRepository.branch, "true");
    await host.messageHandler({
      command: "gitRepository.provider",
      text: "gitlab",
      type: "global"
    });
    assert.strictEqual(
      config.customConfig.gitRepository.apiUrl,
      "https://gitlab.com/api/v4"
    );
    await host.messageHandler({
      command: "syncMethod",
      text: "constructor",
      type: "global"
    });
    assert.strictEqual(
      config.customConfig.syncMethod,
      SyncMethod.GitRepository
    );
    await service.Reset();
    assert.strictEqual(config.customConfig.gitRepository.remote, "");
  });

  it("recovers from a rejected settings write and serializes subsequent edits", async () => {
    let persisted = JSON.parse(JSON.stringify(config.customConfig));
    let fail = true;
    state.commons.GetCustomSettings = async () =>
      JSON.parse(JSON.stringify(persisted));
    state.commons.SetCustomSettings = async value => {
      if (fail) {
        fail = false;
        throw new Error("write failed");
      }
      persisted = JSON.parse(JSON.stringify(value));
      return true;
    };
    new WebviewService().OpenSettingsPage(
      config.customConfig,
      config.extConfig
    );
    await host.messageHandler({
      command: "gitRepository.branch",
      text: "lost",
      type: "global"
    });
    await Promise.all([
      host.messageHandler({
        command: "gitRepository.branch",
        text: "office",
        type: "global"
      }),
      host.messageHandler({
        command: "gitRepository.name",
        text: "new-name",
        type: "global"
      })
    ]);
    assert.strictEqual(persisted.gitRepository.branch, "office");
    assert.strictEqual(persisted.gitRepository.name, "new-name");
    assert.deepStrictEqual(host.errors, ["write failed"]);
  });

  it("creates private GitHub/GitLab repositories with exact public and enterprise API contracts", async () => {
    for (const target of [
      [
        "github",
        "https://api.github.com",
        "https://github.com/me/settings.git",
        "/user/repos"
      ],
      [
        "github",
        "https://git.example/api/v3",
        "https://git.example/me/settings.git",
        "/api/v3/user/repos"
      ],
      [
        "gitlab",
        "https://gitlab.com/api/v4",
        "https://gitlab.com/me/settings.git",
        "/api/v4/projects"
      ],
      [
        "gitlab",
        "https://git.example/api/v4",
        "https://git.example/me/settings.git",
        "/api/v4/projects"
      ]
    ]) {
      const settings = {
        ...config.customConfig.gitRepository,
        provider: target[0],
        apiUrl: target[1],
        token: "private-token",
        name: "settings"
      };
      const result = await createRepository(
        settings,
        async (url, headers, body) => {
          assert.strictEqual(url.pathname, target[3]);
          const data = JSON.parse(body);
          assert.strictEqual(data.name, "settings");
          if (settings.provider === "github") {
            assert.strictEqual(data.private, true);
            assert.strictEqual(headers.Authorization, "Bearer private-token");
          } else {
            assert.strictEqual(data.visibility, "private");
            assert.strictEqual(headers["PRIVATE-TOKEN"], "private-token");
          }
          return settings.provider === "github"
            ? { clone_url: target[2] }
            : { http_url_to_repo: target[2] };
        }
      );
      assert.strictEqual(result, target[2]);
    }
  });

  it("uses the production HTTPS client without following redirects or leaking response errors", async () => {
    const key = await fs.readFile(
      path.resolve(__dirname, "../../test/fixtures/provider-key.pem")
    );
    const cert = await fs.readFile(
      path.resolve(__dirname, "../../test/fixtures/provider-cert.pem")
    );
    const originalCA = https.globalAgent.options.ca;
    let status = 201;
    let requests = 0;
    const server = https.createServer({ key, cert }, (request, response) => {
      requests++;
      let body = "";
      request.on("data", chunk => (body += chunk));
      request.on("end", () => {
        assert.strictEqual(request.method, "POST");
        assert.strictEqual(request.url, "/api/v4/projects");
        assert.strictEqual(
          request.headers["private-token"],
          "local-test-token"
        );
        assert.strictEqual(JSON.parse(body).visibility, "private");
        response.writeHead(status, {
          "Content-Type": "application/json",
          Location: "https://localhost/never-follow"
        });
        response.end(
          JSON.stringify(
            status === 201
              ? {
                  http_url_to_repo:
                    "https://localhost:" +
                    (server.address() as AddressInfo).port +
                    "/me/settings.git"
                }
              : { message: "local-test-token" }
          )
        );
      });
    });
    try {
      https.globalAgent.options.ca = cert;
      await new Promise<void>(resolve =>
        server.listen(0, "127.0.0.1", resolve)
      );
      const apiUrl =
        "https://localhost:" +
        (server.address() as AddressInfo).port +
        "/api/v4";
      const settings = {
        ...config.customConfig.gitRepository,
        provider: "gitlab",
        apiUrl,
        token: "local-test-token"
      };
      config.customConfig.gitRepository = settings;
      // Real Commons reloads JSON into a fresh object, not the initial webview object.
      let persisted = JSON.parse(JSON.stringify(config.customConfig));
      state.commons.GetCustomSettings = async () =>
        JSON.parse(JSON.stringify(persisted));
      state.commons.SetCustomSettings = async value => {
        persisted = JSON.parse(JSON.stringify(value));
        return true;
      };
      const view = new WebviewService();
      state.commons.webviewService = view;
      view.OpenSettingsPage(config.customConfig, config.extConfig);
      host.answer = "Create";
      await host.messageHandler("createRepository");
      assert.ok(persisted.gitRepository.remote.endsWith("/me/settings.git"));
      const createdRemote = persisted.gitRepository.remote;
      await host.messageHandler({
        command: "gitRepository.branch",
        text: "office",
        type: "global"
      });
      assert.strictEqual(persisted.gitRepository.branch, "office");
      assert.strictEqual(persisted.gitRepository.remote, createdRemote);
      assert.deepStrictEqual(host.errors, []);
      status = 302;
      await assert.rejects(createRepository(settings), /HTTP 302/);
      status = 403;
      try {
        await createRepository(settings);
        assert.fail("Expected provider failure");
      } catch (error) {
        assert.ok(error.message.includes("HTTP 403"));
        assert.ok(!error.message.includes("local-test-token"));
      }
      assert.strictEqual(requests, 3);
    } finally {
      https.globalAgent.options.ca = originalCA;
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("confines provider tokens to the matching HTTPS host and rejects unsafe remotes", async () => {
    const settings = {
      ...config.customConfig.gitRepository,
      remote: "https://github.com/me/settings.git",
      token: "private-token"
    };
    const env = gitEnvironment(settings);
    assert.ok(
      Object.values(env).some(
        value =>
          value ===
          "Authorization: Basic " +
            Buffer.from("x-access-token:private-token").toString("base64")
      )
    );
    assert.ok(
      !Object.values(env).some(
        value => value && value.includes("https://private-token")
      )
    );
    assert.throws(
      () =>
        gitEnvironment({
          ...settings,
          remote: "https://attacker.example/repo"
        }),
      /must match/
    );
    for (const remote of [
      "-upload-pack=evil",
      "ext::evil",
      "https://token@github.com/r",
      "http://github.com/r"
    ]) {
      assert.throws(() => validateRemote(remote));
    }
    assert.throws(
      () => providerUrl({ ...settings, apiUrl: "http://git.example/api/v4" }),
      /HTTPS/
    );
    await assert.rejects(
      createRepository(settings, async () => ({
        clone_url: "https://attacker.example/repo"
      })),
      /unexpected repository host/
    );
    config.customConfig.gitRepository.branch = "--bad";
    await assert.rejects(service.Export(), /valid branch/);
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
    await publish(document(files));
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
    await publish(document(files));
    await assert.rejects(service.Import(), /valid JSONC object/);
    assert.strictEqual(await fs.readFile(snippet, "utf8"), "original");
  });
});
