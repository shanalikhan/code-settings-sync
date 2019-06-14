import { env } from "vscode";
import { state } from "../state";

export class InstanceManagerService {
  public static isOriginalInstance(): boolean {
    return state.context.globalState.get("syncInstance") === env.sessionId;
  }

  public static instanceSet(): boolean {
    return state.context.globalState.get("syncInstance") !== "";
  }

  public static setInstance(): Thenable<void> {
    return state.context.globalState.update("syncInstance", env.sessionId);
  }

  public static unsetInstance(): Thenable<void> {
    return state.context.globalState.update("syncInstance", "");
  }
}
