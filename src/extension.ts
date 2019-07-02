"use strict";

import * as vscode from "vscode";
import Commons from "./commons";
import { Environment } from "./environment";
import { GistService } from "./service/gist.service";
import { InitService } from "./service/init.service";
import { LocalizationService } from "./service/localization.service";
import { SettingsService } from "./service/settings.service";
import { WebviewService } from "./service/webview.service";
import { state } from "./state";

export async function activate(context: vscode.ExtensionContext) {
  state.context = context;
  state.environment = new Environment();

  const localizationService = new LocalizationService();
  state.localize = localizationService.Localize.bind(localizationService);

  state.settings = new SettingsService();
  state.webview = new WebviewService();
  state.syncService = new GistService();
  state.commons = new Commons();

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.updateSettings",
      state.syncService.UploadSettings.bind(state.syncService)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.downloadSettings",
      state.syncService.DownloadSettings.bind(state.syncService)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.resetSettings",
      state.settings.ResetSettings.bind(state.settings)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.HowSettings",
      state.settings.OpenHelp.bind(state.settings)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.otherOptions",
      state.settings.OpenAdvancedOptions.bind(state.settings)
    )
  );

  await InitService.init();
}
