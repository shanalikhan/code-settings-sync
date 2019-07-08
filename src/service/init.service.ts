import { commands } from "vscode";
import { state } from "../state";
import { AutoUploadService } from "./autoUpload.service";

export class InitService {
  public static async init(): Promise<void> {
    await state.settings.MigrateSettings();

    const [extSettings, customSettings] = await Promise.all([
      state.settings.GetExtensionSettings(),
      state.settings.GetCustomSettings()
    ]);

    AutoUploadService.Instantiate(customSettings);

    if (extSettings) {
      if (!(await state.syncService.IsConfigured())) {
        state.webview.OpenLandingPage();
        return;
      }

      if (extSettings.autoDownload) {
        await commands.executeCommand("extension.downloadSettings");
      }
      if (extSettings.autoUpload) {
        await AutoUploadService.HandleStartWatching();
      }
    }
  }
}
