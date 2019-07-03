import { CustomConfig } from "./custom-config.model";
import { ExtensionConfig } from "./extension-config.model";

export class LocalConfig {
  public extConfig = new ExtensionConfig();
  public customConfig = new CustomConfig();
}
