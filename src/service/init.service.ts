import { commands } from "vscode";
import { state } from "../state";
import { AutoUploadService } from "./autoUpload.service";

export class InitService {
  public static async init(): Promise<void> {
    await state.commons.StartMigrationProcess();

    const [extSettings, customSettings] = await Promise.all([
      state.settings.GetExtensionSettings(),
      state.settings.GetCustomSettings()
    ]);

    AutoUploadService.Instantiate(customSettings);

    if (extSettings) {
      const tokenAvailable = !!customSettings.token;
      const gistAvailable = !!extSettings.gist;

      if (!customSettings.downloadPublicGist && !tokenAvailable) {
        state.webview.OpenLandingPage();
        return;
      }

      if (gistAvailable && extSettings.autoDownload) {
        await commands.executeCommand("extension.downloadSettings");
      }
      if (extSettings.autoUpload && tokenAvailable && gistAvailable) {
        await AutoUploadService.HandleStartWatching();
      }
    }
  }
}
