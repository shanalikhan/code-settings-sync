import { ExtensionContext } from "vscode";
import Commons from "../commons";
import { Environment } from "../environmentPath";
import { WatcherService } from "../service/watcher/watcher.service";

export interface IExtensionState {
  context?: ExtensionContext;
  environment?: Environment;
  commons?: Commons;
  instanceID: string;
  watcher?: WatcherService;
}
