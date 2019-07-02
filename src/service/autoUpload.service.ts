import * as vscode from "vscode";
import { watch } from "vscode-chokidar";
import lockfile from "../lockfile";
import { CustomConfig } from "../models/customConfig.model";
import { state } from "../state";
import { Util } from "../util";
import { FileService } from "./file.service";

export class AutoUploadService {
  public static GetIgnoredItems(customSettings: CustomConfig) {
    return [
      ...customSettings.ignoreUploadFolders.map(folder => `**/${folder}/**`),
      ...customSettings.ignoreUploadFiles.map(file => `**/${file}`)
    ];
  }

  public static async Instantiate(customSettings?: CustomConfig) {
    if (!customSettings) {
      customSettings = await state.settings.GetCustomSettings();
    }
    state.autoUpload = new AutoUploadService(
      AutoUploadService.GetIgnoredItems(customSettings)
    );
  }

  public static async HandleStartWatching() {
    if (state.autoUpload) {
      state.autoUpload.StartWatching();
    } else {
      await this.Instantiate();
      this.HandleStartWatching();
    }
  }

  public static async HandleStopWatching() {
    if (state.autoUpload) {
      state.autoUpload.StopWatching();
    } else {
      await this.Instantiate();
      this.HandleStopWatching();
    }
  }

  public watching = false;

  private watcher = watch(state.environment.USER_FOLDER, {
    depth: 2,
    ignored: this.ignored
  });

  constructor(private ignored: string[]) {
    vscode.extensions.onDidChange(async () => {
      if (this.watching && vscode.window.state.focused) {
        console.log("Sync: Extensions changed");
        if (await lockfile.Check(state.environment.FILE_SYNC_LOCK)) {
          return;
        } else {
          await lockfile.Lock(state.environment.FILE_SYNC_LOCK);
        }
        await this.InitiateAutoUpload();
        await lockfile.Unlock(state.environment.FILE_SYNC_LOCK);
        return;
      }
    });
  }

  public async StartWatching() {
    this.StopWatching();

    this.watching = true;

    this.watcher.addListener("change", async (path: string) => {
      if (this.watching && vscode.window.state.focused) {
        console.log(`Sync: ${FileService.ExtractFileName(path)} changed`);
        if (await lockfile.Check(state.environment.FILE_SYNC_LOCK)) {
          return;
        } else {
          await lockfile.Lock(state.environment.FILE_SYNC_LOCK);
        }

        const customConfig = await state.settings.GetCustomSettings();
        if (customConfig) {
          const fileType: string = path
            .substring(path.lastIndexOf("."), path.length)
            .slice(1);
          if (customConfig.supportedFileExtensions.includes(fileType)) {
            await this.InitiateAutoUpload();
          }
        }
        await lockfile.Unlock(state.environment.FILE_SYNC_LOCK);
        return;
      }
    });
  }

  public StopWatching() {
    if (this.watcher) {
      this.watcher.removeAllListeners();
    }
    this.watching = false;
  }

  private async InitiateAutoUpload() {
    const customSettings = await state.settings.GetCustomSettings();

    vscode.window.setStatusBarMessage("").dispose();
    vscode.window.setStatusBarMessage(
      state.localize(
        "common.info.initAutoUpload",
        customSettings.autoUploadDelay.toString()
      ),
      5000
    );

    await Util.Sleep(customSettings.autoUploadDelay * 1000);

    vscode.commands.executeCommand("extension.updateSettings", "forceUpdate");
  }
}
