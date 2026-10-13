import { strict as assert } from "assert";
import { execFileSync } from "child_process";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";
import { CustomConfig } from "../../../src/models/customConfig.model";
import { RepositoryConfig } from "../../../src/models/repositoryConfig.model";
import { File, FileService } from "../../../src/service/file.service";
import { createRepository } from "../../../src/service/repository/repositoryApi.service";
import {
  RepositoryStorage,
  settingsPath,
  validateRepository
} from "../../../src/service/repository/repositoryStorage.service";

describe("Repository settings sync", function() {
  this.timeout(60000);
  let directory: string;
  let config: RepositoryConfig;
  let previousConfig: string;
  let previousSystem: string;

  function git(args: string[], cwd = directory) {
    return execFileSync(
      "git",
      [
        "-c",
        "user.name=Sync Test",
        "-c",
        "user.email=sync@example.invalid",
        ...args
      ],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
  }

  async function upload(storage: RepositoryStorage, text: string) {
    const payload = await storage.ReadGist();
    const next = storage.UpdateGIST(payload, [
      new File("settings.json", text, "", "settings.json"),
      new File("snippet.json", "{}", "", "snippets|café.json"),
      new File(
        "cloudSettings",
        '{"lastUpload":"2026-01-01T00:00:00Z"}',
        "",
        "cloudSettings"
      )
    ]);
    return storage.SaveGIST(next.data);
  }

  beforeEach(async () => {
    directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "sync repository test ")
    );
    git(["init", "--bare", "remote.git"]);
    previousConfig = process.env.GIT_CONFIG_GLOBAL;
    previousSystem = process.env.GIT_CONFIG_NOSYSTEM;
    const global = path.join(directory, "gitconfig");
    await fs.writeFile(
      global,
      `[url "${
        pathToFileURL(path.join(directory, "remote.git")).href
      }"]\n  insteadOf = https://example.invalid/user/settings.git\n`
    );
    process.env.GIT_CONFIG_GLOBAL = global;
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    config = Object.assign(new RepositoryConfig(), {
      apiUrl: "https://example.invalid/api/v3",
      url: "https://example.invalid/user/settings.git",
      token: "test-token"
    });
  });

  afterEach(async () => {
    if (previousConfig === undefined) {
      delete process.env.GIT_CONFIG_GLOBAL;
    } else {
      process.env.GIT_CONFIG_GLOBAL = previousConfig;
    }
    if (previousSystem === undefined) {
      delete process.env.GIT_CONFIG_NOSYSTEM;
    } else {
      process.env.GIT_CONFIG_NOSYSTEM = previousSystem;
    }
    await fs.remove(directory);
  });

  it("round trips real Git commits, nested settings and Unicode; isolates branches", async () => {
    await upload(new RepositoryStorage(config), '{"theme":"home"}');
    const reader = new RepositoryStorage(config);
    assert.equal(
      (await reader.ReadGist()).data.files["settings.json"].content,
      '{"theme":"home"}'
    );
    assert.equal(await reader.IsGistNewer("", new Date("2025-01-01")), true);
    const office = Object.assign(new RepositoryConfig(), config, {
      branch: "office"
    });
    await upload(new RepositoryStorage(office), '{"theme":"office"}');
    assert.equal(
      (await new RepositoryStorage(config).ReadGist()).data.files[
        "settings.json"
      ].content,
      '{"theme":"home"}'
    );
    assert.equal(
      (await new RepositoryStorage(office).ReadGist()).data.files[
        "snippets|café.json"
      ].content,
      "{}"
    );
  });

  it("rejects concurrent changes after the upload snapshot", async () => {
    await upload(new RepositoryStorage(config), "first");
    const stale = new RepositoryStorage(config);
    const snapshot = await stale.ReadGist();
    await upload(new RepositoryStorage(config), "second");
    await assert.rejects(
      stale.SaveGIST(snapshot.data),
      /remote branch changed/
    );
    assert.equal(
      (await new RepositoryStorage(config).ReadGist()).data.files[
        "settings.json"
      ].content,
      "second"
    );
  });

  it("preserves unrelated repository files and removes only managed settings", async () => {
    git(["clone", path.join(directory, "remote.git"), "seed"]);
    const seed = path.join(directory, "seed");
    git(["checkout", "-b", "master"], seed);
    await fs.writeFile(path.join(seed, "README.md"), "keep me");
    // Fetched files must not be able to replace the process's trusted helpers.
    await fs.outputFile(
      path.join(seed, "empty-hooks", "pre-commit"),
      "#!/bin/sh\nexit 77\n"
    );
    await fs.outputFile(path.join(seed, "askpass.sh"), "#!/bin/sh\nexit 77\n");
    git(["add", "."], seed);
    git(
      ["update-index", "--chmod=+x", "empty-hooks/pre-commit", "askpass.sh"],
      seed
    );
    git(["commit", "-m", "seed"], seed);
    git(["push", "origin", "master"], seed);
    await upload(new RepositoryStorage(config), "{}");
    const storage = new RepositoryStorage(config);
    const payload = await storage.ReadGist();
    storage.UpdateGIST(payload, [
      new File("settings.json", "new", "", "settings.json")
    ]);
    await storage.SaveGIST(payload.data);
    assert.equal(
      git(["--git-dir=remote.git", "show", "master:README.md"]),
      "keep me"
    );
    assert.throws(() =>
      git([
        "--git-dir=remote.git",
        "show",
        "master:settings/snippets/café.json"
      ])
    );
  });

  it("rejects malicious names, credentials in URLs and wrong provider hosts", () => {
    for (const name of [
      "..|escape.json",
      ".git|config",
      "snippets|..|escape.json",
      "syncLocalSettings.json",
      "x\\y.json",
      "C:secret",
      "nul.json"
    ]) {
      assert.throws(() => settingsPath(name));
    }
    assert.equal(
      settingsPath("|customized_sync|.prettierrc"),
      "custom-files/.prettierrc"
    );
    assert.throws(() =>
      validateRepository({
        ...config,
        url: "https://user:secret@example.invalid/user/settings.git"
      })
    );
    assert.throws(() =>
      validateRepository({
        ...config,
        url: "https://other.invalid/user/settings.git"
      })
    );
    assert.throws(() =>
      validateRepository({ ...config, apiUrl: "http://example.invalid/api/v3" })
    );
    for (const branch of [
      "HEAD",
      "../main",
      "a..b",
      "bad name",
      "a.lock",
      "a//b",
      "x@{y",
      "bad[branch"
    ]) {
      assert.throws(() => validateRepository({ ...config, branch }));
    }
  });

  it("always excludes .git and local tokens, even when ignore lists are empty", async () => {
    const user = path.join(directory, "User");
    await fs.outputFile(path.join(user, ".git", "secret.json"), "token");
    await fs.outputFile(path.join(user, "syncLocalSettings.json"), "token");
    await fs.outputFile(path.join(user, "settings.json"), "{}");
    const settings = {
      ignoreUploadFolders: [],
      ignoreUploadFiles: [],
      supportedFileExtensions: ["json"]
    } as CustomConfig;
    const files = await FileService.ListFiles(user, settings);
    assert.deepEqual(
      files.map(file => file.fileName),
      ["settings.json"]
    );
    await assert.rejects(
      FileService.GetCustomFile(
        path.join(user, ".git", "secret.json"),
        "secret"
      ),
      /cannot be uploaded/
    );
  });

  it("creates private repositories using GitHub and self-managed GitLab API contracts", async () => {
    for (const provider of ["github", "gitlab"]) {
      const setup = Object.assign(new RepositoryConfig(), config, {
        provider,
        apiUrl: `https://example.invalid/${
          provider === "github" ? "api/v3" : "api/v4"
        }`
      });
      const request: any = async (url: string, options: any) => {
        assert.equal(
          url,
          setup.apiUrl + (provider === "github" ? "/user/repos" : "/projects")
        );
        assert.equal(options.redirect, "error");
        const body = JSON.parse(options.body);
        assert.equal(
          provider === "github" ? body.private : body.visibility,
          provider === "github" ? true : "private"
        );
        assert.equal(
          provider === "github"
            ? options.headers.Authorization
            : options.headers["PRIVATE-TOKEN"],
          provider === "github" ? "token test-token" : "test-token"
        );
        return {
          ok: true,
          json: async () => ({
            clone_url: config.url,
            http_url_to_repo: config.url
          })
        };
      };
      assert.equal(
        await createRepository(setup, "settings", request),
        config.url
      );
    }
    await assert.rejects(
      createRepository(config, "bad/name"),
      /repository name/
    );
  });
});
