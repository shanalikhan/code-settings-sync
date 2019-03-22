"use strict";

import { watchFile } from "fs-extra";
import * as vscode from "vscode";
import { init as initLocalize } from "./localize";
import { Sync } from "./sync";

export async function activate(context: vscode.ExtensionContext) {
  await initLocalize();

  const sync = new Sync(context);

  sync.bootstrap();

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.updateSettings",
      sync.upload.bind(sync)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.downloadSettings",
      sync.download.bind(sync)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.resetSettings",
      sync.reset.bind(sync)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.HowSettings",
      sync.how.bind(sync)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.otherOptions",
      sync.advance.bind(sync)
    )
  );

  let userPath: string;
  switch (process.platform) {
    case "win32":
      userPath = `${process.env.APPDATA}/Code/User/`;
      break;
    case "linux":
      userPath = `${process.env.HOME}/.config/Code/User/`;
      break;
    case "darwin":
      userPath = `${process.env.HOME}/Library/Application Support/Code/User/`;
      break;
  }
  watchFile(userPath + "settings.json", () => sync.upload());
  vscode.extensions.onDidChange(() => sync.upload());
}
