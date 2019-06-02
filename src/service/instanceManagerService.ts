import { env, ExtensionContext } from "vscode";

export class InstanceManagerService {
  public static isOriginalInstance(context: ExtensionContext): boolean {
    return context.globalState.get("syncInstance") === env.sessionId;
  }

  public static instanceSet(context: ExtensionContext): boolean {
    return context.globalState.get("syncInstance") !== "";
  }

  public static setInstance(context: ExtensionContext): Thenable<void> {
    return context.globalState.update("syncInstance", env.sessionId);
  }

  public static unsetInstance(context: ExtensionContext): Thenable<void> {
    return context.globalState.update("syncInstance", "");
  }
}
