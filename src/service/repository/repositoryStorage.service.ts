import { execFile } from "child_process";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { URL } from "url";
import { RepositoryConfig } from "../../models/repositoryConfig.model";
import { File } from "../file.service";
import { ISettingsStorage } from "../settingsStorage.model";

const manifestName = ".settings-sync-manifest.json";

export function validateRepository(
  config: RepositoryConfig,
  requireUrl = true
) {
  const api = new URL(config.apiUrl);
  if (
    api.protocol !== "https:" ||
    api.username ||
    api.password ||
    api.search ||
    api.hash
  ) {
    throw new Error(
      "Use an HTTPS API URL without credentials or query parameters."
    );
  }
  if (!["github", "gitlab"].includes(config.provider) || !config.token.trim()) {
    throw new Error(
      "Choose GitHub or GitLab and enter a personal access token."
    );
  }
  if (
    !config.branch ||
    config.branch.startsWith("-") ||
    config.branch === "HEAD" ||
    config.branch.includes("..") ||
    config.branch.includes("@{") ||
    /[ ~^:?*[\\]/.test(config.branch) ||
    Array.from(config.branch).some(
      character =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    ) ||
    config.branch
      .split("/")
      .some(
        part =>
          !part ||
          part.startsWith(".") ||
          part.endsWith(".") ||
          part.endsWith(".lock")
      )
  ) {
    throw new Error("Enter a named Git branch, such as master or office.");
  }
  if (requireUrl) {
    const remote = new URL(config.url);
    const sameServer =
      api.origin === remote.origin ||
      (config.provider === "github" &&
        api.origin === "https://api.github.com" &&
        remote.origin === "https://github.com");
    if (
      remote.protocol !== "https:" ||
      remote.username ||
      remote.password ||
      remote.search ||
      remote.hash ||
      !sameServer ||
      !remote.pathname.endsWith(".git")
    ) {
      throw new Error(
        "Use an HTTPS .git clone URL on the selected provider's server, without credentials."
      );
    }
  }
}

// Each encoded settings name has one portable, bounded path in the repository.
export function settingsPath(name: string): string {
  const custom = name.startsWith("|customized_sync|");
  const parts = (custom ? name.slice("|customized_sync|".length) : name).split(
    "|"
  );
  if (
    !parts.length ||
    parts.some(
      part =>
        !part ||
        part === "." ||
        part === ".." ||
        /[\\/:<>"?*]/.test(part) ||
        Array.from(part).some(character => character.charCodeAt(0) < 32) ||
        /[. ]$/.test(part) ||
        /^(\.git|syncLocalSettings\.json)$/i.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    )
  ) {
    throw new Error("Unsafe or non-portable settings filename.");
  }
  return [custom ? "custom-files" : "settings", ...parts].join("/");
}

export class RepositoryStorage implements ISettingsStorage {
  public userName: string = null;
  private expectedHead: string;
  private remoteFiles: any;

  constructor(private config: RepositoryConfig) {}

  public async CreateEmptyGIST(): Promise<string> {
    throw new Error(
      "Configure or create a Git repository in Sync Settings first."
    );
  }

  public async ReadGist(): Promise<any> {
    validateRepository(this.config);
    return this.WithRepository(async (directory, git) => {
      this.expectedHead = await this.Fetch(git);
      const files = this.expectedHead ? await this.ReadFiles(directory) : {};
      this.remoteFiles = files;
      return {
        data: { id: this.config.url, owner: null, public: false, files }
      };
    });
  }

  public async IsGistNewer(_id: string, lastDownload: Date): Promise<boolean> {
    const cloud = this.remoteFiles && this.remoteFiles.cloudSettings;
    return (
      !!cloud &&
      new Date(JSON.parse(cloud.content).lastUpload) > new Date(lastDownload)
    );
  }

  public UpdateGIST(payload: any, files: File[]): any {
    const next = Object.create(null);
    for (const name of Object.keys(payload.data.files)) {
      if (name.startsWith("keybindings")) {
        next[name] = payload.data.files[name];
      }
    }
    for (const file of files) {
      settingsPath(file.gistName);
      next[file.gistName] = { content: file.content };
    }
    payload.data.files = next;
    return payload;
  }

  public async SaveGIST(payload: any): Promise<boolean> {
    validateRepository(this.config);
    if (this.expectedHead === undefined) {
      throw new Error("Read the selected repository branch before uploading.");
    }
    return this.WithRepository(async (directory, git) => {
      const current = await this.Fetch(git);
      if (current !== this.expectedHead) {
        throw new Error(
          "The remote branch changed during sync. Download and retry."
        );
      }
      const previous = current ? await this.ReadFiles(directory) : {};
      const names: string[] = Object.keys(payload.files);
      const paths = new Set<string>();
      for (const name of names) {
        const target = settingsPath(name).toLowerCase();
        if (
          paths.has(target) ||
          typeof payload.files[name].content !== "string"
        ) {
          throw new Error("Duplicate filename or invalid settings content.");
        }
        paths.add(target);
        const file = path.join(directory, settingsPath(name));
        await this.CheckPath(directory, settingsPath(name));
        if (
          !Object.prototype.hasOwnProperty.call(previous, name) &&
          (await fs.pathExists(file))
        ) {
          throw new Error(
            "Upload would replace a repository file that Settings Sync does not manage."
          );
        }
      }
      for (const name of Object.keys(previous)) {
        if (!Object.prototype.hasOwnProperty.call(payload.files, name)) {
          await fs.remove(path.join(directory, settingsPath(name)));
        }
      }
      for (const name of names) {
        await fs.outputFile(
          path.join(directory, settingsPath(name)),
          payload.files[name].content,
          "utf8"
        );
      }
      await fs.writeJson(
        path.join(directory, manifestName),
        { version: 1, files: names },
        { spaces: 2 }
      );
      await git(
        ["add", "--", manifestName, "settings", "custom-files"].filter(
          arg =>
            (arg !== "settings" && arg !== "custom-files") ||
            fs.existsSync(path.join(directory, arg))
        )
      );
      await git([
        "-c",
        "user.name=Settings Sync",
        "-c",
        "user.email=settings-sync@users.noreply.github.com",
        "commit",
        "--allow-empty",
        "-m",
        "Update synchronized VS Code settings"
      ]);
      const ref = "refs/heads/" + this.config.branch;
      // An explicit expected OID prevents an upload from erasing a concurrent update.
      await git([
        "push",
        `--force-with-lease=${ref}:${current || ""}`,
        "origin",
        `HEAD:${ref}`
      ]);
      return true;
    });
  }

  private async CheckPath(directory: string, relative: string) {
    let current = directory;
    for (const segment of relative.split("/")) {
      current = path.join(current, segment);
      try {
        if ((await fs.lstat(current)).isSymbolicLink()) {
          throw new Error("Settings paths must not contain symbolic links.");
        }
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }
  }

  private async ReadFiles(
    directory: string
  ): Promise<Record<string, { content: string }>> {
    await this.CheckPath(directory, manifestName);
    const manifest = path.join(directory, manifestName);
    if (!(await fs.pathExists(manifest))) {
      return Object.create(null) as Record<string, { content: string }>;
    }
    const data = await fs.readJson(manifest);
    if (
      data.version !== 1 ||
      !Array.isArray(data.files) ||
      data.files.length > 10000
    ) {
      throw new Error("Unsupported Settings Sync repository manifest.");
    }
    const files: Record<string, { content: string }> = Object.create(null);
    const paths = new Set<string>();
    for (const name of data.files) {
      if (typeof name !== "string") {
        throw new Error("Invalid manifest filename.");
      }
      const relative = settingsPath(name);
      if (paths.has(relative.toLowerCase())) {
        throw new Error("Duplicate manifest filename.");
      }
      paths.add(relative.toLowerCase());
      await this.CheckPath(directory, relative);
      files[name] = {
        content: await fs.readFile(path.join(directory, relative), "utf8")
      };
    }
    return files;
  }

  private async Fetch(
    git: (args: string[]) => Promise<string>
  ): Promise<string> {
    const ref = "refs/heads/" + this.config.branch;
    const advertised = (
      await git(["ls-remote", "--heads", "origin", ref])
    ).trim();
    if (!advertised) {
      return null;
    }
    await git(["fetch", "--no-tags", "origin", ref]);
    await git(["reset", "--hard", "FETCH_HEAD"]);
    return (await git(["rev-parse", "HEAD"])).trim();
  }

  private async WithRepository<T>(
    action: (
      directory: string,
      git: (args: string[]) => Promise<string>
    ) => Promise<T>
  ): Promise<T> {
    const temporary = await fs.mkdtemp(
      path.join(os.tmpdir(), "settings-sync-")
    );
    try {
      // Authentication helpers and hooks must stay outside the fetched tree.
      const directory = path.join(temporary, "checkout");
      await fs.ensureDir(directory);
      const askpass = path.join(temporary, "askpass.sh");
      await fs.writeFile(
        askpass,
        '#!/bin/sh\ncase "$1" in\n*Username*) printf "%s" "$SYNC_GIT_USERNAME";;\n*) printf "%s" "$SYNC_GIT_TOKEN";;\nesac\n',
        { mode: 0o700 }
      );
      const hooks = path.join(temporary, "empty-hooks");
      await fs.ensureDir(hooks);
      const git = (args: string[]) =>
        new Promise<string>((resolve, reject) => {
          execFile(
            "git",
            [
              "-c",
              "credential.helper=",
              "-c",
              "http.followRedirects=false",
              "-c",
              `core.hooksPath=${hooks}`,
              ...args
            ],
            {
              cwd: directory,
              env: {
                ...process.env,
                GIT_TERMINAL_PROMPT: "0",
                GIT_ASKPASS: askpass,
                SYNC_GIT_USERNAME:
                  this.config.provider === "gitlab"
                    ? "oauth2"
                    : "x-access-token",
                SYNC_GIT_TOKEN: this.config.token
              },
              timeout: 120000,
              maxBuffer: 32 * 1024 * 1024
            },
            (error, stdout) =>
              error
                ? reject(
                    new Error(
                      "Git repository operation failed. Check the server, branch, token permissions and network connection."
                    )
                  )
                : resolve(stdout)
          );
        });
      await git(["check-ref-format", "refs/heads/" + this.config.branch]);
      await git(["init"]);
      await git(["remote", "add", "origin", this.config.url]);
      return await action(directory, git);
    } finally {
      await fs.remove(temporary);
    }
  }
}
