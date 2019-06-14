"use strict";

import * as vscode from "vscode";
import { Environment } from "./environmentPath";
import { init as initLocalize } from "./localize";
import { InstanceManagerService } from "./service/instanceManager.service";
import { state } from "./state";
import { Sync } from "./sync";

export async function activate(context: vscode.ExtensionContext) {
  state.context = context;
  state.environment = new Environment();

  await initLocalize();

  const sync = new Sync();

  sync.bootstrap();

  if (!InstanceManagerService.instanceSet()) {
    InstanceManagerService.setInstance();
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

export async function deactivate() {
  if (InstanceManagerService.isOriginalInstance()) {
    InstanceManagerService.unsetInstance();
  }
}
