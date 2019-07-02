import { UISettingType } from "./settingType.model";

export interface IWebviewSetting {
  name: string;
  placeholder: string;
  type: UISettingType;
  correspondingSetting: string;
  tooltip?: string;
}
