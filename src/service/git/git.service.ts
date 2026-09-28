import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { LocalConfig } from "../../models/localConfig.model";
import { ISyncService } from "../../models/ISyncService.model";
import { IExtensionState } from "../../models/state.model";
import { createRepository } from "./provider";
import { SettingsSnapshotService } from "./snapshot.service";
import { parseSnapshot } from "./store";
import { GitTransport } from "./transport";

export class GitRepositoryService implements ISyncService {
  private static running = false;
  constructor(private state: IExtensionState) {}

  public async IsConfigured(): Promise<boolean> {
    const config = await this.state.commons.GetCustomSettings();
    return (
      !!config.gitRepository &&
      !!config.gitRepository.remote &&
      !!config.gitRepository.branch
    );
  }

  public async Reset(): Promise<void> {
    const config = await this.state.commons.GetCustomSettings();
    config.gitRepository.remote = "";
    config.gitRepository.token = "";
    await this.state.commons.SetCustomSettings(config);
  }

  public async CreateRepository(): Promise<void> {
    const config = await this.state.commons.GetCustomSettings();
    if (
      (await vscode.window.showWarningMessage(
        "Create private repository " +
          config.gitRepository.name +
          " at " +
          config.gitRepository.apiUrl +
          "?",
        "Create"
      )) !== "Create"
    ) {
      return;
    }
    const remote = await createRepository(config.gitRepository);
    config.gitRepository.remote = remote;
    if (!(await this.state.commons.SetCustomSettings(config))) {
      throw new Error(
        "Repository created at " +
          remote +
          ", but its URL could not be saved. Enter it in Sync Settings."
      );
    }
    this.state.commons.webviewService.UpdateSettingsPage(
      config,
      this.state.commons.GetSettings()
    );
    void vscode.window.showInformationMessage(
      "Private repository created. Upload settings to create the selected branch."
    );
  }

  public async Export(): Promise<void> {
    await this.synchronize(true);
  }
  public async Import(): Promise<void> {
    await this.synchronize(false);
  }

  private async synchronize(upload: boolean): Promise<void> {
    if (GitRepositoryService.running) {
      throw new Error(
        "A Git settings sync is already running. Retry when it finishes."
      );
    }
    GitRepositoryService.running = true;
    let transport: GitTransport;
    let folder: string;
    let config: LocalConfig;
    try {
      config = await this.state.commons.InitalizeSettings();
      await this.state.watcher.HandleStopWatching();
      transport = new GitTransport(config.customConfig.gitRepository);
      const previous = await transport.open();
      folder = await fs.mkdtemp(
        path.join(os.tmpdir(), "settings-sync-snapshot-")
      );
      if (previous !== null) {
        parseSnapshot(previous);
        await fs.writeFile(path.join(folder, "settings-sync.json"), previous, {
          encoding: "utf8",
          mode: 0o600
        });
      } else if (!upload) {
        throw new Error(
          "The selected repository branch has no settings-sync.json snapshot. Upload settings first."
        );
      }
      const snapshot = new SettingsSnapshotService(this.state, folder);
      const changed = upload
        ? await snapshot.Export()
        : await snapshot.Import();
      if (!changed) {
        return;
      }
      if (upload) {
        await transport.push(
          await fs.readFile(path.join(folder, "settings-sync.json"), "utf8")
        );
      }
      const message =
        "Sync: " +
        (upload ? "Uploaded to" : "Downloaded from") +
        " Git profile " +
        config.customConfig.gitRepository.branch;
      vscode.window.setStatusBarMessage(message, 5000);
      if (!config.extConfig.quietSync) {
        void vscode.window.showInformationMessage(message);
      }
    } finally {
      try {
        if (transport) {
          await transport.close();
        }
        if (folder) {
          await fs.remove(folder);
        }
      } finally {
        GitRepositoryService.running = false;
        if (config && config.extConfig.autoUpload) {
          await this.state.watcher.HandleStartWatching();
        }
      }
    }
  }
}
