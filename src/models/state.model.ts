import { ExtensionContext } from "vscode";
import Commons from "../commons";
import { Environment } from "../environment";
import { AutoUploadService } from "../service/autoUpload.service";
import { SettingsService } from "../service/settings.service";
import { WebviewService } from "../service/webview.service";
import { ISyncService } from "./sync.model";

export interface IExtensionState {
  context?: ExtensionContext;
  environment?: Environment;
  commons?: Commons;
  settings?: SettingsService;
  autoUpload?: AutoUploadService;
  webview?: WebviewService;
  syncService?: ISyncService;
  localize: (key: string, ...args: any[]) => string;
}
