import { SyncMethod } from "../enums/syncMethod.enum";
import { ISyncService } from "../models/ISyncService.model";
import { IExtensionState } from "../models/state.model";
import { FileSystemService } from "./filesystem/filesystem.service";
import { GistService } from "./github/gist.service";

export class FactoryService {
  public static CreateSyncService(
    state: IExtensionState,
    method: string
  ): ISyncService {
    // Unknown values (e.g. a hand-edited syncLocalSettings.json) fall back to the gist.
    const service = Object.prototype.hasOwnProperty.call(
      this.syncMethods,
      method
    )
      ? this.syncMethods[method]
      : this.syncMethods[SyncMethod.GitHubGist];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return new service(state);
  }
  private static syncMethods = {
    [SyncMethod.GitHubGist]: GistService,
    [SyncMethod.FileSystem]: FileSystemService
  };
}
