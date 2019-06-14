"use strict";

import * as vscode from "vscode";
import { init as initLocalize } from "./localize";
import { InstanceManagerService } from "./service/instanceManagerService";
import { state } from "./state";
import { Sync } from "./sync";

export async function activate(context: vscode.ExtensionContext) {
  state.context = context;

  await initLocalize();

  const sync = new Sync();

  sync.bootstrap();

  if (!InstanceManagerService.instanceSet(state.context)) {
    InstanceManagerService.setInstance(state.context);
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
  if (InstanceManagerService.isOriginalInstance(state.context)) {
    InstanceManagerService.unsetInstance(state.context);
  }
}
