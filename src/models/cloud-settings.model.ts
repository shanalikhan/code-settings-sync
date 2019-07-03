import { Environment } from "../environment";

export class CloudSettings {
  public lastUpload: Date = null;
  public extensionVersion: string = "v" + Environment.version;
}
