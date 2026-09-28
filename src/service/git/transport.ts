import { execFile } from "child_process";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { URL } from "url";
import { promisify } from "util";

export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

export interface RepositorySettings {
  provider: string;
  apiUrl: string;
  remote: string;
  branch: string;
  name: string;
  token: string;
}

export function providerUrl(settings: RepositorySettings): URL {
  if (!["github", "gitlab"].includes(settings.provider)) {
    throw new Error("Select GitHub or GitLab for repository sync.");
  }
  const url = new URL(settings.apiUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "The provider API URL must be HTTPS without credentials or query parameters."
    );
  }
  return url;
}

export function validateRemote(remote: string): void {
  if (
    !remote ||
    Array.from(remote).some(character => character.charCodeAt(0) < 32) ||
    remote.startsWith("-")
  ) {
    throw new Error(
      "Configure a valid Git repository URL or absolute local path."
    );
  }
  if (path.isAbsolute(remote) || /^[\w.-]+@[\w.-]+:[^\s]+$/.test(remote)) {
    return;
  }
  const url = new URL(remote);
  if (
    !["https:", "ssh:"].includes(url.protocol) ||
    url.password ||
    (url.protocol === "https:" && url.username) ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Use HTTPS or SSH without embedded credentials, or an absolute local repository path."
    );
  }
}

export function gitEnvironment(
  settings: RepositorySettings
): NodeJS.ProcessEnv {
  validateRemote(settings.remote);
  const environment: NodeJS.ProcessEnv = { ...process.env };
  // Isolate temporary repositories from inherited Git overrides and hooks.
  for (const key of Object.keys(environment)) {
    if (key.startsWith("GIT_")) {
      delete environment[key];
    }
  }
  Object.assign(environment, {
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: os.platform() === "win32" ? "NUL" : "/dev/null",
    GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
    GIT_AUTHOR_NAME: "Settings Sync",
    GIT_AUTHOR_EMAIL: "settings-sync@localhost",
    GIT_COMMITTER_NAME: "Settings Sync",
    GIT_COMMITTER_EMAIL: "settings-sync@localhost"
  });
  const options: Array<[string, string]> = [
    ["http.followRedirects", "false"],
    ["protocol.ext.allow", "never"],
    ["fetch.recurseSubmodules", "false"],
    ["core.hooksPath", os.platform() === "win32" ? "NUL" : "/dev/null"]
  ];
  if (settings.token && settings.remote.startsWith("https://")) {
    const api = providerUrl(settings);
    const remote = new URL(settings.remote);
    const host =
      api.hostname === "api.github.com" && settings.provider === "github"
        ? "github.com"
        : api.hostname;
    if (remote.hostname !== host || api.port !== remote.port) {
      throw new Error(
        "The repository host must match the provider API host before sending its token."
      );
    }
    const username =
      settings.provider === "github" ? "x-access-token" : "oauth2";
    const authorization = Buffer.from(username + ":" + settings.token).toString(
      "base64"
    );
    options.push([
      "http." + remote.origin + "/.extraHeader",
      "Authorization: Basic " + authorization
    ]);
  }
  environment.GIT_CONFIG_COUNT = String(options.length);
  options.forEach((option, index) => {
    environment["GIT_CONFIG_KEY_" + String(index)] = option[0];
    environment["GIT_CONFIG_VALUE_" + String(index)] = option[1];
  });
  return environment;
}

/** A disposable Git object database. No remote files, hooks or filters are checked out. */
export class GitTransport {
  private folder: string;
  private previous = "";
  private environment: NodeJS.ProcessEnv;

  constructor(private settings: RepositorySettings) {
    this.environment = gitEnvironment(settings);
  }

  public async open(): Promise<string | null> {
    if (
      !this.settings.branch ||
      this.settings.branch.startsWith("-") ||
      this.settings.branch === "HEAD"
    ) {
      throw new Error("Choose a valid branch/profile name.");
    }
    this.folder = await fs.mkdtemp(
      path.join(os.tmpdir(), "settings-sync-git-")
    );
    await this.run(["init", "--quiet"]);
    await this.run(["check-ref-format", "--branch", this.settings.branch]);
    const ref = "refs/heads/" + this.settings.branch;
    const listing = await this.run([
      "ls-remote",
      "--heads",
      this.settings.remote,
      ref
    ]);
    if (!listing.trim()) {
      return null;
    }
    await this.run([
      "fetch",
      "--quiet",
      "--no-tags",
      this.settings.remote,
      ref
    ]);
    this.previous = (await this.run(["rev-parse", "FETCH_HEAD"])).trim();
    const entry = (
      await this.run(["ls-tree", this.previous, "--", "settings-sync.json"])
    ).trim();
    if (!entry) {
      return null;
    }
    if (!/^100(644|755) blob /.test(entry)) {
      throw new Error(
        "The repository settings snapshot must be a regular file."
      );
    }
    const object = this.previous + ":settings-sync.json";
    if (
      Number(await this.run(["cat-file", "-s", object])) > MAX_SNAPSHOT_BYTES
    ) {
      throw new Error(
        "The repository snapshot exceeds 8 MiB. Reduce it in the repository before syncing."
      );
    }
    return this.run(["show", object]);
  }

  public async push(snapshot: string): Promise<void> {
    if (Buffer.byteLength(snapshot, "utf8") > MAX_SNAPSHOT_BYTES) {
      throw new Error(
        "The settings snapshot exceeds 8 MiB. Exclude large files before uploading."
      );
    }
    const filename = path.join(this.folder, "settings-sync.json");
    await fs.writeFile(filename, snapshot, { encoding: "utf8", mode: 0o600 });
    if (this.previous) {
      await this.run(["read-tree", this.previous]);
    }
    const blob = (
      await this.run(["hash-object", "-w", "--no-filters", "--", filename])
    ).trim();
    await this.run([
      "update-index",
      "--add",
      "--cacheinfo",
      "100644," + blob + ",settings-sync.json"
    ]);
    const tree = (await this.run(["write-tree"])).trim();
    const parents = this.previous ? ["-p", this.previous] : [];
    const commit = (
      await this.run([
        "commit-tree",
        tree,
        ...parents,
        "-m",
        "Update VS Code settings"
      ])
    ).trim();
    const ref = "refs/heads/" + this.settings.branch;
    // A concurrent writer must be fetched before an overwrite can be intentional.
    await this.run([
      "push",
      "--quiet",
      "--force-with-lease=" + ref + ":" + this.previous,
      this.settings.remote,
      commit + ":" + ref
    ]);
  }

  public async close(): Promise<void> {
    if (this.folder) {
      await fs.remove(this.folder);
    }
  }

  private async run(args: string[]): Promise<string> {
    try {
      const result = await promisify(execFile)("git", args, {
        cwd: this.folder,
        env: this.environment,
        encoding: "utf8",
        timeout: 120000,
        maxBuffer: MAX_SNAPSHOT_BYTES
      });
      return result.stdout;
    } catch (error) {
      // Git may include URLs and credentials in stderr; never display raw output.
      throw new Error(
        "Git " +
          args[0] +
          " failed (" +
          String(error.code || "timeout") +
          "). Check Git 2.31+, repository access, branch name and concurrent updates."
      );
    }
  }
}
