"use strict";

import { execFile } from "child_process";
import * as fs from "fs-extra";
import * as path from "path";

// NOTE: this module must not import "vscode" so it can be unit tested with plain mocha.

const CUSTOMIZED_SYNC_PREFIX = "|customized_sync|";
const CUSTOMIZED_SYNC_DIR = "customized_sync";
const GIT_TIMEOUT = 120000;
const PRESERVED_FILES = /^(keybindings.*|readme.*|license.*|\.gitignore|\.gitattributes)$/i;

export interface IRepoFile {
  gistName: string;
  content: string;
}

export interface IRepoFiles {
  [gistName: string]: { content: string };
}

export interface IGitRepoOptions {
  repoDir: string;
  remoteUrl: string;
  branch: string;
  token?: string;
  authUser?: string;
  proxy?: string;
}

interface IGitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class PushRejectedError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, PushRejectedError.prototype);
    this.name = "PushRejectedError";
  }
}

function isUnsafeSegment(segment: string): boolean {
  return (
    segment === "" ||
    segment === "." ||
    segment === ".." ||
    segment.toLowerCase() === ".git" ||
    segment.indexOf("\0") > -1 ||
    segment.indexOf(":") > -1
  );
}

function isSafeRepoPath(repoPath: string): boolean {
  if (!repoPath || repoPath.indexOf("\\") > -1) {
    return false;
  }
  return !repoPath.split("/").some(isUnsafeSegment);
}

/**
 * "snippets|a.json" => "snippets/a.json"
 * "|customized_sync|.htmlhintrc" => "customized_sync/.htmlhintrc"
 */
export function gistNameToRepoPath(gistName: string): string {
  let repoPath: string;
  if (gistName.indexOf(CUSTOMIZED_SYNC_PREFIX) === 0) {
    repoPath =
      CUSTOMIZED_SYNC_DIR +
      "/" +
      gistName.substring(CUSTOMIZED_SYNC_PREFIX.length);
  } else {
    repoPath = gistName.split("|").join("/");
  }
  if (!isSafeRepoPath(repoPath)) {
    throw new Error("Sync: Unsafe file name for repository: " + gistName);
  }
  return repoPath;
}

/**
 * Inverse of gistNameToRepoPath. Returns null for unsafe paths.
 */
export function repoPathToGistName(repoPath: string): string {
  if (!isSafeRepoPath(repoPath)) {
    return null;
  }
  if (repoPath.indexOf(CUSTOMIZED_SYNC_DIR + "/") === 0) {
    return (
      CUSTOMIZED_SYNC_PREFIX +
      repoPath.substring(CUSTOMIZED_SYNC_DIR.length + 1)
    );
  }
  return repoPath.split("/").join("|");
}

export function validateBranchName(branch: string): void {
  if (
    !branch ||
    branch.charAt(0) === "-" ||
    branch.charAt(0) === "/" ||
    /[\s~^:?*\[\\\x00-\x1f\x7f]/.test(branch) ||
    branch.indexOf("..") > -1 ||
    branch.indexOf("@{") > -1 ||
    branch.indexOf("//") > -1 ||
    branch === "@" ||
    /(\/|\.|\.lock)$/.test(branch)
  ) {
    throw new Error("Sync: Invalid branch name: " + branch);
  }
}

export function validateRemoteUrl(remoteUrl: string): void {
  if (!remoteUrl || !remoteUrl.trim() || remoteUrl.charAt(0) === "-") {
    throw new Error("Sync: Invalid repository URL.");
  }
  if (/^ext::/i.test(remoteUrl)) {
    throw new Error("Sync: Unsupported repository URL.");
  }
}

/**
 * Remove "user:password@" from http(s) URLs so they can be displayed safely.
 */
export function stripCredentials(remoteUrl: string): string {
  return (remoteUrl || "").replace(/^(https?:\/\/)[^@\/]*@/i, "$1");
}

export class GitRepoService {
  private gitVersion: number[] = null;

  constructor(private options: IGitRepoOptions) {
    validateBranchName(options.branch);
    validateRemoteUrl(options.remoteUrl);
  }

  /**
   * Create the local repository (if needed) and point "origin" to the remote.
   */
  public async ensureRepo(): Promise<void> {
    await fs.ensureDir(this.options.repoDir);
    if (!(await fs.pathExists(path.join(this.options.repoDir, ".git")))) {
      await this.git(["init"]);
    }
    await this.git(["config", "core.autocrlf", "false"]);
    const remotes = (await this.git(["remote"])).stdout.split(/\r?\n/);
    if (remotes.indexOf("origin") > -1) {
      await this.git(["remote", "set-url", "origin", this.options.remoteUrl]);
    } else {
      await this.git(["remote", "add", "origin", this.options.remoteUrl]);
    }
  }

  /**
   * Make the working tree equal to the remote branch (like a forced pull).
   * When the branch does not exist remotely the working tree is emptied and
   * the branch starts without history. Returns whether the remote branch exists.
   */
  public async syncFromRemote(): Promise<boolean> {
    const branch = this.options.branch;
    const ref = "refs/heads/" + branch;
    const remoteRef = "refs/remotes/origin/" + branch;

    const listing = await this.git(["ls-remote", "--heads", "origin", ref]);
    const exists = listing.stdout.trim() !== "";

    if (exists) {
      await this.git(["fetch", "origin", "+" + ref + ":" + remoteRef]);
      await this.git(["checkout", "--force", "-B", branch, remoteRef]);
    } else {
      await this.git(["update-ref", "-d", ref], true);
      await this.git(["symbolic-ref", "HEAD", ref]);
      await this.git(["read-tree", "--empty"]);
    }
    await this.git(["clean", "-fdxq"]);
    return exists;
  }

  /**
   * Read every tracked file of the working tree, keyed by gist name.
   */
  public async readFiles(): Promise<IRepoFiles> {
    const files: IRepoFiles = {};
    for (const repoPath of await this.listTrackedFiles()) {
      const gistName = repoPathToGistName(repoPath);
      if (gistName === null) {
        continue;
      }
      files[gistName] = {
        content: await fs.readFile(this.toFullPath(repoPath), "utf8")
      };
    }
    return files;
  }

  /**
   * Replace the repository content with the given files, commit and push.
   * Throws PushRejectedError when the remote branch changed in the meantime.
   */
  public async commitAndPush(
    files: IRepoFile[],
    message: string
  ): Promise<"pushed" | "unchanged"> {
    const wanted: string[] = [];
    for (const file of files) {
      const repoPath = gistNameToRepoPath(file.gistName);
      wanted.push(repoPath);
      await fs.outputFile(this.toFullPath(repoPath), file.content);
    }

    for (const repoPath of await this.listTrackedFiles()) {
      if (
        wanted.indexOf(repoPath) === -1 &&
        !(repoPath.indexOf("/") === -1 && PRESERVED_FILES.test(repoPath))
      ) {
        await fs.remove(this.toFullPath(repoPath));
      }
    }

    await this.git(["add", "-A"]);
    const status = await this.git(["status", "--porcelain", "-z"]);
    if (status.stdout.trim() === "") {
      return "unchanged";
    }

    const identity: string[] = ["-c", "commit.gpgsign=false"];
    for (const key of ["user.name", "user.email"]) {
      const configured = await this.git(["config", "--get", key], true);
      if (configured.stdout.trim() === "") {
        identity.push(
          "-c",
          key +
            "=" +
            (key === "user.name" ? "Settings Sync" : "settings-sync@localhost")
        );
      }
    }
    await this.git([...identity, "commit", "--no-verify", "-m", message]);

    const push = await this.git(
      ["push", "origin", "HEAD:refs/heads/" + this.options.branch],
      true
    );
    if (push.code !== 0) {
      const reason = this.redact(push.stderr).trim();
      if (
        /\[rejected\]|non-fast-forward|fetch first|stale info/i.test(reason)
      ) {
        throw new PushRejectedError(
          "Sync: The remote branch changed since it was read. Download first or enable force upload. " +
            reason
        );
      }
      throw new Error("Sync: git push failed. " + reason);
    }
    return "pushed";
  }

  private toFullPath(repoPath: string): string {
    return path.join(this.options.repoDir, ...repoPath.split("/"));
  }

  private async listTrackedFiles(): Promise<string[]> {
    const result = await this.git(["ls-files", "-z"]);
    return result.stdout.split("\0").filter(name => name !== "");
  }

  private redact(text: string): string {
    let result = text || "";
    const token = this.options.token;
    if (token) {
      const basic = Buffer.from(
        (this.options.authUser || "x-access-token") + ":" + token
      ).toString("base64");
      result = result
        .split(basic)
        .join("***")
        .split(token)
        .join("***");
    }
    return result;
  }

  private isHttpRemote(): boolean {
    return /^https?:\/\//i.test(this.options.remoteUrl);
  }

  private async getGitVersion(): Promise<number[]> {
    if (this.gitVersion === null) {
      const result = await this.exec(["--version"], false, []);
      const match = /(\d+)\.(\d+)/.exec(result.stdout);
      this.gitVersion = match ? [Number(match[1]), Number(match[2])] : [0, 0];
    }
    return this.gitVersion;
  }

  /**
   * Run git. The access token is only given to the process (never written to
   * .git/config) and only for http(s) remotes.
   */
  private async git(args: string[], allowFail = false): Promise<IGitResult> {
    const configs: Array<[string, string]> = [];
    if (this.isHttpRemote()) {
      const origin = /^(https?:\/\/[^\/]+)/i.exec(this.options.remoteUrl)[1];
      if (this.options.token) {
        const basic = Buffer.from(
          (this.options.authUser || "x-access-token") + ":" + this.options.token
        ).toString("base64");
        configs.push([
          "http." + origin + "/.extraHeader",
          "Authorization: Basic " + basic
        ]);
      }
      if (this.options.proxy) {
        configs.push(["http.proxy", this.options.proxy]);
      }
    }
    return this.exec(args, allowFail, configs);
  }

  private async exec(
    args: string[],
    allowFail: boolean,
    configs: Array<[string, string]>
  ): Promise<IGitResult> {
    const env: { [key: string]: string } = {
      ...(process.env as { [key: string]: string }),
      GIT_TERMINAL_PROMPT: "0",
      GIT_ALLOW_PROTOCOL: "file:git:http:https:ssh",
      LC_ALL: "C"
    };
    if (!env.GIT_SSH_COMMAND && !env.GIT_SSH) {
      env.GIT_SSH_COMMAND = "ssh -o BatchMode=yes";
    }
    let prefix: string[] = ["-c", "core.quotepath=off"];

    if (configs.length > 0) {
      const version = this.gitVersion || (await this.getGitVersion());
      if (version[0] > 2 || (version[0] === 2 && version[1] >= 31)) {
        env.GIT_CONFIG_COUNT = String(configs.length);
        configs.forEach((config, index) => {
          env["GIT_CONFIG_KEY_" + index] = config[0];
          env["GIT_CONFIG_VALUE_" + index] = config[1];
        });
      } else {
        // GIT_CONFIG_COUNT needs git >= 2.31
        configs.forEach(config => {
          prefix = [...prefix, "-c", config[0] + "=" + config[1]];
        });
      }
    }

    return new Promise<IGitResult>((resolve, reject) => {
      execFile(
        "git",
        [...prefix, ...args],
        {
          cwd: this.options.repoDir,
          env,
          maxBuffer: 256 * 1024 * 1024,
          timeout: GIT_TIMEOUT
        },
        (error: any, stdout: string, stderr: string) => {
          if (!error) {
            resolve({ code: 0, stdout, stderr });
            return;
          }
          if (error.code === "ENOENT") {
            reject(
              new Error("Sync: Git executable was not found. Install Git.")
            );
            return;
          }
          const result: IGitResult = {
            code: typeof error.code === "number" ? error.code : 1,
            stdout: stdout || "",
            stderr: stderr || String(error.message || "")
          };
          if (allowFail) {
            resolve(result);
          } else {
            reject(
              new Error(
                "Sync: git " +
                  args[0] +
                  " failed. " +
                  this.redact(result.stderr).trim()
              )
            );
          }
        }
      );
    });
  }
}
