import { state } from "../state";

export class CloudSettings {
  public lastUpload: Date = null;
  public extensionVersion: string = "v" + state.environment.getVersion();
}
