import { state } from "../state";

export class InstanceManagerService {
  public static isOriginalInstance(): boolean {
    return state.context.globalState.get("syncInstance") === state.instanceID;
  }

  public static instanceSet(): boolean {
    return state.context.globalState.get("syncInstance") !== "";
  }

  public static setInstance(): Thenable<void> {
    return state.context.globalState.update("syncInstance", state.instanceID);
  }

  public static unsetInstance(): Thenable<void> {
    return state.context.globalState.update("syncInstance", "");
  }

  public static updateTime(): Thenable<void> {
    return state.context.globalState.update(
      "instanceCheck",
      new Date().getMinutes().toString()
    );
  }

  public static getTime(): string {
    return state.context.globalState.get("instanceCheck");
  }

  public static checkAndUpdate() {
    if (InstanceManagerService.isOriginalInstance()) {
      InstanceManagerService.updateTime();
    }
    if (
      InstanceManagerService.getTime() !== new Date().getMinutes().toString()
    ) {
      InstanceManagerService.unsetInstance();
    }
  }
}
