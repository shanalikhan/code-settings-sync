import { UISettingType } from "./setting-type.model";

export interface IWebviewSetting {
  name: string;
  placeholder: string;
  type: UISettingType;
  correspondingSetting: string;
  tooltip?: string;
}
