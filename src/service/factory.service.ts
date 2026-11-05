import { SyncMethod } from "../enums/syncMethod.enum";
import { ISyncService } from "../models/ISyncService.model";
import { IExtensionState } from "../models/state.model";
import { GistService } from "./github/gist.service";
import { FileSystemService } from "./filesystem/filesystem.service";

export class FactoryService {
  public static CreateSyncService(
    state: IExtensionState,
    method: string
  ): ISyncService {
    if (!Object.prototype.hasOwnProperty.call(this.syncMethods, method)) {
      throw new Error("Unknown settings sync method.");
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return new this.syncMethods[method](state);
  }
  private static syncMethods = {
    [SyncMethod.GitHubGist]: GistService,
    [SyncMethod.FileSystem]: FileSystemService
  };
}
