import { execFile } from "child_process";
import * as fs from "fs-extra";
import * as path from "path";
import * as vscode from "vscode";
import { CustomConfig } from "../../models/customConfig.model";
import { validateBranch, validateRemote } from "./repositorySettings";
import { ISyncService } from "../../models/ISyncService.model";
import { IExtensionState } from "../../models/state.model";

interface GitRunResult {
  changed: boolean;
  pushed: boolean;
}

class GitCommandRunner {
  public run(cwd: string, args: string[], trimOutput = true): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      execFile("git", args, { cwd }, (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || stdout || error.message).trim();
          reject(new Error("Git " + args[0] + " failed: " + detail));
          return;
        }
        resolve(trimOutput ? stdout.trim() : stdout);
      });
    });
  }
}

export class GitRepositorySyncService implements ISyncService {
  private runner = new GitCommandRunner();

  constructor(private state: IExtensionState) {}

  public async IsConfigured(): Promise<boolean> {
    const customSettings = await this.state.commons.GetCustomSettings();
    if (
      !customSettings ||
      !customSettings.repositorySync ||
      customSettings.repositorySync.mode !== "repository"
    ) {
      return false;
    }
    try {
      this.remote(customSettings.repositorySync.remoteUrl);
      this.branch(customSettings.repositorySync.branch);
      return true;
    } catch (_) {
      return false;
    }
  }

  public async Reset(): Promise<void> {
    return;
  }

  public async Export(_optArgument?: unknown[]): Promise<void> {
    const localConfig = await this.state.commons.InitalizeSettings();
    const customSettings = localConfig.customConfig;
    const remote = this.remote(customSettings.repositorySync.remoteUrl);
    const branch = this.branch(customSettings.repositorySync.branch);

    await this.state.watcher.HandleStopWatching();
    try {
      vscode.window.setStatusBarMessage(
        "Sync: Saving settings to the configured Git repository...",
        2000
      );
      const result = await this.upload(
        this.state.environment.USER_FOLDER,
        remote,
        branch,
        customSettings
      );
      vscode.window.setStatusBarMessage(
        result.pushed
          ? "Sync: Settings were pushed to the Git repository."
          : result.changed
          ? "Sync: Settings were committed locally."
          : "Sync: The Git repository already contains the latest settings.",
        5000
      );
    } finally {
      if (localConfig.extConfig.autoUpload) {
        await this.state.watcher.HandleStartWatching();
      }
    }
  }

  public async Import(_optArgument?: unknown[]): Promise<void> {
    const localConfig = await this.state.commons.InitalizeSettings();
    const customSettings = localConfig.customConfig;
    const remote = this.remote(customSettings.repositorySync.remoteUrl);
    const branch = this.branch(customSettings.repositorySync.branch);

    await this.state.watcher.HandleStopWatching();
    try {
      vscode.window.setStatusBarMessage(
        "Sync: Downloading settings from the configured Git repository...",
        2000
      );
      await this.download(
        this.state.environment.USER_FOLDER,
        remote,
        branch,
        customSettings
      );
      vscode.window.setStatusBarMessage(
        "Sync: Settings were downloaded from the Git repository.",
        5000
      );
    } finally {
      if (localConfig.extConfig.autoUpload) {
        await this.state.watcher.HandleStartWatching();
      }
    }
  }

  private async upload(
    directory: string,
    remote: string,
    branch: string,
    customSettings: CustomConfig
  ): Promise<GitRunResult> {
    await this.initialize(directory, branch);
    await this.writeManagedExcludes(directory, customSettings);
    await this.ensureRemote(directory, remote);
    // Refresh remote-tracking refs before --force-with-lease. A fresh local
    // repository otherwise has no lease for an existing remote branch, while a
    // stale repository could protect an older remote state. Fetching first
    // makes the push reject only if the branch changes after this point.
    await this.runner.run(directory, ["fetch", "--prune", "origin"]);
    // Git ignore rules only prevent adding UNTRACKED files. Once a user has
    // tracked a settings/credential file, newly ignoring it is insufficient:
    // git add --all would still stage and publish future changes to that file.
    // Drop ignored files from Git's INDEX, not from the local user folder.
    await this.untrackIgnoredFiles(directory);
    await this.runner.run(directory, ["add", "--all"]);

    const changed = Boolean(
      await this.runner.run(directory, ["status", "--porcelain"])
    );
    if (changed) {
      await this.runner.run(directory, [
        "-c",
        "user.name=Settings Sync",
        "-c",
        "user.email=settings-sync@localhost",
        "commit",
        "-m",
        "Sync settings"
      ]);
    }

    await this.runner.run(directory, [
      "push",
      "--force-with-lease",
      "--set-upstream",
      "origin",
      branch
    ]);
    return { changed, pushed: true };
  }

  private async untrackIgnoredFiles(directory: string): Promise<void> {
    // NUL-delimited output protects names with whitespace, newlines and
    // leading dashes. Existing Git ignore rules and our managed excludes
    // both apply; the on-disk settings are never deleted.
    const ignored = await this.runner.run(directory, [
      "ls-files",
      "--cached",
      "--ignored",
      "--exclude-standard",
      "-z"
    ], false);
    const paths = ignored.split("\0").filter(Boolean);
    // Bound argv length while preserving filename boundaries and the
    // destructive-command '--' separator. This changes only Git's index.
    for (let i = 0; i < paths.length; i += 50) {
      await this.runner.run(directory, [
        "rm",
        "--cached",
        "--force",
        "--",
        ...paths.slice(i, i + 50)
      ]);
    }
  }

  private async download(
    directory: string,
    remote: string,
    branch: string,
    customSettings: CustomConfig
  ): Promise<void> {
    // Do not use the normal (non-forced) branch checkout before fetching.
    // Dirty tracked settings may block it, even though the user explicitly
    // requested force-download. Fetch first and only then force checkout.
    await this.initialize(directory, branch, false);
    await this.writeManagedExcludes(directory, customSettings);
    await this.ensureRemote(directory, remote);
    await this.runner.run(directory, ["fetch", "--prune", "origin", branch]);
    await this.runner.run(directory, [
      "checkout",
      "--force",
      "-B",
      branch,
      "origin/" + branch
    ]);
    await this.runner.run(directory, ["reset", "--hard", "origin/" + branch]);
    // Force-download updates tracked settings; never erase unrelated untracked
    // VS Code user files with `git clean -fd` in the entire user directory.
  }

  private async initialize(
    directory: string,
    branch: string,
    checkoutBranch = true
  ): Promise<void> {
    await fs.ensureDir(directory);
    await this.runner.run(directory, ["check-ref-format", "--branch", branch]);
    if (!(await fs.pathExists(path.join(directory, ".git")))) {
      await this.runner.run(directory, ["init"]);
    }
    if (checkoutBranch) {
      await this.ensureBranch(directory, branch);
    }
  }

  private async ensureBranch(directory: string, branch: string): Promise<void> {
    let current = "";
    try {
      current = await this.runner.run(directory, [
        "symbolic-ref",
        "--short",
        "HEAD"
      ]);
    } catch (_) {
      current = "";
    }
    if (current === branch) {
      return;
    }
    try {
      await this.runner.run(directory, ["checkout", branch]);
    } catch (_) {
      await this.runner.run(directory, ["checkout", "-b", branch]);
    }
  }

  private async ensureRemote(directory: string, remote: string): Promise<void> {
    let current = "";
    try {
      current = await this.runner.run(directory, ["remote", "get-url", "origin"]);
    } catch (_) {
      current = "";
    }
    if (!current) {
      await this.runner.run(directory, ["remote", "add", "origin", remote]);
    } else if (current !== remote) {
      await this.runner.run(directory, ["remote", "set-url", "origin", remote]);
    }
  }

  private async writeManagedExcludes(
    directory: string,
    customSettings: CustomConfig
  ): Promise<void> {
    const excludePath = path.join(directory, ".git", "info", "exclude");
    const start = "# Settings Sync managed ignores";
    const end = "# End Settings Sync managed ignores";
    const existing = (await fs.pathExists(excludePath))
      ? await fs.readFile(excludePath, "utf8")
      : "";
    const pattern = new RegExp(
      start + "[\\s\\S]*?" + end + "(?:\\r?\\n)?",
      "g"
    );
    const unmanaged = existing.replace(pattern, "");
    const separator =
      unmanaged && !/[\r\n]$/.test(unmanaged) ? "\n" : "";
    const managed = [
      start,
      ...customSettings.ignoreUploadFiles,
      ...customSettings.ignoreUploadFolders.map(folder => {
        const normalized =
          folder.charAt(folder.length - 1) === "/"
            ? folder.substring(0, folder.length - 1)
            : folder;
        return normalized + "/";
      }),
      end,
      ""
    ].join("\n");
    await fs.ensureDir(path.dirname(excludePath));
    await fs.writeFile(excludePath, unmanaged + separator + managed);
  }

  private remote(value: string): string {
    const raw = String(value || "");
    const remote = raw.trim();
    // Validate again at the actual Git I/O boundary. Settings may be loaded
    // from disk or legacy configuration without visiting the settings UI.
    // Use the same allowlist as the UI so Git's executable ext:: remote helper
    // and other unapproved URL schemes never reach fetch/push.
    validateRemote(raw, remote);
    return remote;
  }

  private branch(value: string): string {
    const raw = String(value || "");
    const branch = raw.trim();
    // Persisted or legacy configuration can bypass the settings page. Enforce
    // the same branch grammar at the Git I/O boundary as at save time.
    validateBranch(raw, branch);
    return branch;
  }
}
