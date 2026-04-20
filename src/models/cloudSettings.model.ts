import { Environment } from "../environmentPath";

export class CloudSettings {
  public lastUpload: Date = null;
  public extensionVersion: string = "v" + Environment.getVersion();
  public repo: string = "https://github.com/princelundgren/code-settings-sync";
}
