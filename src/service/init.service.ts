import { commands } from "vscode";
import Commons from "../commons";
import { state } from "../state";

export class InitService {
  public async init(): Promise<void> {
    state.commons = new Commons();

    await state.commons.StartMigrationProcess();
    const extSettings = await state.commons.GetSettings();
    const customSettings = await state.commons.GetCustomSettings();

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
