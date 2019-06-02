"use strict";

import * as vscode from "vscode";
import { init as initLocalize } from "./localize";
import { InstanceManagerService } from "./service/instanceManagerService";
import { Sync } from "./sync";

export async function activate(context: vscode.ExtensionContext) {
  await initLocalize();

  const sync = new Sync(context);

  sync.bootstrap();

  if (!InstanceManagerService.instanceSet(context)) {
    InstanceManagerService.setInstance(this.options.context);
  }

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
}

export async function deactivate(context: vscode.ExtensionContext) {
  if (InstanceManagerService.isOriginalInstance(context)) {
    InstanceManagerService.unsetInstance(context);
  }
}
