// Run after tsc: node test/service/repository/pipeline-smoke.js
// The VS Code shell is mocked; file collection, Git storage and import are real.
const assert = require("assert").strict;
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");
const Module = require("module");
const root = path.resolve(__dirname, "../../..");
const errors = [];
process.env.VSCODE_NLS_CONFIG = JSON.stringify({ locale: "en" });
const load = Module._load;
Module._load = function(name, ...args) {
  if (name === "vscode") {
    return {
      extensions: { getExtension: () => ({ extensionPath: root }), all: [] },
      window: {
        setStatusBarMessage: () => ({ dispose() {} }),
        showErrorMessage: message => errors.push(message),
        showInformationMessage: async () => "Yes"
      },
      workspace: { getConfiguration: () => ({ get: () => undefined }) }
    };
  }
  return load.call(this, name, ...args);
};
const { GistService } = require(path.join(
  root,
  "out/src/service/github/gist.service"
));
const { state } = require(path.join(root, "out/src/state"));
const { LocalConfig } = require(path.join(
  root,
  "out/src/models/localConfig.model"
));
Module._load = load;

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pipeline-"));
  try {
    execFileSync(
      "git",
      ["init", "--bare", path.join(directory, "remote.git")],
      { stdio: "pipe" }
    );
    const configPath = path.join(directory, "gitconfig");
    await fs.writeFile(
      configPath,
      `[url "${
        pathToFileURL(path.join(directory, "remote.git")).href
      }"]\n insteadOf = https://example.invalid/user/settings.git\n`
    );
    process.env.GIT_CONFIG_GLOBAL = configPath;
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    const user = path.join(directory, "User");
    state.environment = {
      getVersion: () => "3.4.4",
      USER_FOLDER: user + path.sep,
      FILE_SETTING_NAME: "settings.json",
      FILE_KEYBINDING_NAME: "keybindings.json",
      FILE_KEYBINDING_DEFAULT: "keybindings.json",
      FILE_KEYBINDING_MAC: "keybindingsMac.json",
      FILE_CLOUDSETTINGS_NAME: "cloudSettings",
      FILE_EXTENSION_NAME: "extensions.json",
      FILE_CUSTOMIZEDSETTINGS: path.join(user, "syncLocalSettings.json")
    };
    const settings = new LocalConfig();
    settings.customConfig.syncMethod = "GitRepository";
    Object.assign(settings.customConfig.repositorySettings, {
      apiUrl: "https://example.invalid/api/v3",
      url: "https://example.invalid/user/settings.git",
      token: "fake-token"
    });
    // A previously downloaded public Gist must not block repository upload.
    settings.customConfig.githubSettings.gistSettings.downloadPublicGist = true;
    Object.assign(settings.extConfig, {
      forceUpload: true,
      forceDownload: true,
      quietSync: true,
      syncExtensions: false
    });
    const customPath = path.join(directory, ".prettierrc");
    settings.customConfig.customFiles[".prettierrc"] = customPath;
    await fs.outputFile(
      path.join(user, "settings.json"),
      '{"editor.fontSize":18}'
    );
    await fs.outputFile(
      path.join(user, "snippets", "sample.json"),
      '{"example":{}}'
    );
    await fs.outputFile(
      state.environment.FILE_CUSTOMIZEDSETTINGS,
      "local-secret"
    );
    await fs.outputFile(path.join(user, ".git", "config.json"), "git-secret");
    await fs.outputFile(customPath, '{"semi":true}');
    state.commons = {
      InitalizeSettings: async () => settings,
      GetCustomSettings: async () => settings.customConfig,
      GetSettings: () => settings.extConfig,
      SaveSettings: async () => true,
      SetCustomSettings: async () => true,
      ERROR_MESSAGE: "Unexpected sync failure"
    };
    state.watcher = {
      HandleStopWatching: async () => {},
      HandleStartWatching: async () => {}
    };
    const service = new GistService(state);
    await service.Export();
    assert.deepEqual(errors, []);
    assert(settings.customConfig.repositorySettings.lastUpload);
    await fs.writeFile(
      path.join(user, "settings.json"),
      '{"editor.fontSize":10}'
    );
    await fs.remove(path.join(user, "snippets"));
    await fs.writeFile(customPath, "{}");
    await service.Import();
    assert.deepEqual(errors, []);
    assert.equal(
      JSON.parse(await fs.readFile(path.join(user, "settings.json"), "utf8"))[
        "editor.fontSize"
      ],
      18
    );
    assert.equal(
      await fs.readFile(path.join(user, "snippets", "sample.json"), "utf8"),
      '{"example":{}}'
    );
    assert.equal(await fs.readFile(customPath, "utf8"), '{"semi":true}');
    assert.equal(
      await fs.readFile(state.environment.FILE_CUSTOMIZEDSETTINGS, "utf8"),
      "local-secret"
    );
    console.log(
      "PASS: shared upload/download pipeline, nested snippets, custom files, public-Gist switch and local credential preservation"
    );
  } finally {
    await fs.remove(directory);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
