import { ExtensionContext } from "vscode";
import Commons from "../commons";
import { Environment } from "../environmentPath";
import { AutoUploadService } from "../service/autoUpload.service";
import { SettingsService } from "../service/settings.service";

export interface IExtensionState {
  context?: ExtensionContext;
  environment?: Environment;
  commons?: Commons;
  settings?: SettingsService;
  autoUpload?: AutoUploadService;
}
