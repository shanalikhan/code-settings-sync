import { CustomConfig } from "./custom-config.model";
import { ExtensionConfig } from "./extension-config.model";

export class LocalConfig {
  public publicGist: boolean = false;
  public userName: string = null;
  public name: string = null;
  public extConfig = new ExtensionConfig();
  public customConfig = new CustomConfig();
}
