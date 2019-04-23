import { env, ExtensionContext } from "vscode";

export class InstanceManagerService {
  public static isOriginalInstance(context: ExtensionContext): boolean {
    return context.workspaceState.get("syncInstance") === env.sessionId;
  }

  public static originalInstanceExists(context: ExtensionContext): boolean {
    return !!context.workspaceState.get("syncInstance");
  }

  public static setOriginalInstance(context: ExtensionContext): Thenable<void> {
    return context.workspaceState.update("syncInstance", env.sessionId);
  }
}
