"use strict";

import * as vscode from "vscode";
import { Environment } from "./environmentPath";
import { init as initLocalize } from "./localize";
import { InitService } from "./service/init.service";
import { SettingsService } from "./service/settings.service";
import { SyncService } from "./service/sync.service";
import { state } from "./state";

export async function activate(context: vscode.ExtensionContext) {
  state.context = context;
  state.environment = new Environment();

  await initLocalize();

  const initService = new InitService();
  const syncService = new SyncService();
  const settingsService = new SettingsService();

  initService.init();

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.updateSettings",
      syncService.UploadSettings.bind(syncService)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.downloadSettings",
      syncService.DownloadSettings.bind(syncService)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.resetSettings",
      settingsService.ResetSettings.bind(settingsService)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.HowSettings",
      settingsService.OpenHelp.bind(settingsService)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.otherOptions",
      settingsService.OpenAdvancedOptions.bind(settingsService)
    )
  );
}
