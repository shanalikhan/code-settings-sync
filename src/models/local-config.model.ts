import { CustomConfig } from "./custom-config.model";
import { ExtensionConfig } from "./extension-config.model";

export interface ILocalConfig {
  extConfig: ExtensionConfig;
  customConfig: CustomConfig;
}
