import { execFile } from "child_process";
import * as fs from "fs-extra";
import * as path from "path";

export interface IGitCommandRunner {
  run(cwd: string, args: string[]): Promise<string>;
}

export interface IGitSyncResult {
  changed: boolean;
  pushed: boolean;
}

export class GitCommandRunner implements IGitCommandRunner {
  public run(cwd: string, args: string[]): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      execFile("git", args, { cwd }, (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || stdout || error.message).trim();
          reject(new Error(`git ${args[0]} failed: ${detail}`));
          return;
        }
        resolve(stdout.trim());
      });
    });
  }
}

export class GitSyncService {
  public static IsEnabled(config: { exportType: string }): boolean {
    return String(config.exportType || "").toLowerCase() === "git";
  }

  constructor(
    private readonly directory: string,
    private readonly remote: string,
    private readonly branch: string,
    private readonly ignoredFiles: string[],
    private readonly ignoredFolders: string[],
    private readonly runner: IGitCommandRunner = new GitCommandRunner()
  ) {}

  public async upload(): Promise<IGitSyncResult> {
    await this.initialize();
    await this.ensureBranch();
    await this.writeManagedExcludes();
    await this.runner.run(this.directory, ["add", "--all"]);

    const changed = Boolean(
      await this.runner.run(this.directory, ["status", "--porcelain"])
    );
    if (changed) {
      await this.runner.run(this.directory, [
        "-c",
        "user.name=Settings Sync",
        "-c",
        "user.email=settings-sync@localhost",
        "commit",
        "-m",
        "Sync settings"
      ]);
    }

    if (!this.remote) {
      return { changed, pushed: false };
    }

    await this.ensureRemote();
    await this.runner.run(this.directory, [
      "push",
      "--force-with-lease",
      "--set-upstream",
      "origin",
      this.branch
    ]);
    return { changed, pushed: true };
  }

  public async download(): Promise<void> {
    if (!this.remote) {
      throw new Error("A Git remote is required before downloading settings.");
    }

    await this.initialize();
    await this.ensureRemote();
    await this.writeManagedExcludes();
    await this.runner.run(this.directory, [
      "fetch",
      "--prune",
      "origin",
      this.branch
    ]);
    await this.runner.run(this.directory, [
      "checkout",
      "--force",
      "-B",
      this.branch,
      `origin/${this.branch}`
    ]);
    await this.runner.run(this.directory, [
      "reset",
      "--hard",
      `origin/${this.branch}`
    ]);
    await this.runner.run(this.directory, ["clean", "-fd"]);
  }

  private async initialize(): Promise<void> {
    await fs.ensureDir(this.directory);
    await this.runner.run(this.directory, [
      "check-ref-format",
      "--branch",
      this.branch
    ]);
    if (!(await fs.pathExists(path.join(this.directory, ".git")))) {
      await this.runner.run(this.directory, ["init"]);
    }
  }

  private async ensureBranch(): Promise<void> {
    let currentBranch = "";
    try {
      currentBranch = await this.runner.run(this.directory, [
        "symbolic-ref",
        "--short",
        "HEAD"
      ]);
    } catch {
      currentBranch = "";
    }

    if (currentBranch === this.branch) {
      return;
    }

    try {
      await this.runner.run(this.directory, ["checkout", this.branch]);
    } catch {
      await this.runner.run(this.directory, ["checkout", "-b", this.branch]);
    }
  }

  private async ensureRemote(): Promise<void> {
    let currentRemote = "";
    try {
      currentRemote = await this.runner.run(this.directory, [
        "remote",
        "get-url",
        "origin"
      ]);
    } catch {
      currentRemote = "";
    }

    if (!currentRemote) {
      await this.runner.run(this.directory, [
        "remote",
        "add",
        "origin",
        this.remote
      ]);
    } else if (currentRemote !== this.remote) {
      await this.runner.run(this.directory, [
        "remote",
        "set-url",
        "origin",
        this.remote
      ]);
    }
  }

  private async writeManagedExcludes(): Promise<void> {
    const excludePath = path.join(this.directory, ".git", "info", "exclude");
    const startMarker = "# Settings Sync managed ignores";
    const endMarker = "# End Settings Sync managed ignores";
    const existing = (await fs.pathExists(excludePath))
      ? await fs.readFile(excludePath, "utf8")
      : "";
    const pattern = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}\\n?`, "g");
    const managed = [
      startMarker,
      ...this.ignoredFiles,
      ...this.ignoredFolders.map(folder => `${folder.replace(/\/$/, "")}/`),
      endMarker,
      ""
    ].join("\n");

    await fs.ensureDir(path.dirname(excludePath));
    await fs.writeFile(
      excludePath,
      `${existing.replace(pattern, "").trim()}\n${managed}`
    );
  }
}
