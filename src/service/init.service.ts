import { commands } from "vscode";
import Commons from "../commons";
import { state } from "../state";

export class InitService {
  public static async init(): Promise<void> {
    state.commons = new Commons();

    await state.commons.StartMigrationProcess();
    const extSettings = await state.settings.GetExtensionSettings();
    const customSettings = await state.settings.GetCustomSettings();

    if (extSettings) {
      const tokenAvailable = !!customSettings.token;
      const gistAvailable = !!extSettings.gist;

      if (gistAvailable && extSettings.autoDownload) {
        await commands.executeCommand("extension.downloadSettings");
      }
      if (extSettings.autoUpload && tokenAvailable && gistAvailable) {
        await state.commons.HandleStartWatching();
      }
    }
  }
}
