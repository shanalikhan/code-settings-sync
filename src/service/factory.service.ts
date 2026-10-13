import { SyncMethod } from "../enums/syncMethod.enum";
import { ISyncService } from "../models/ISyncService.model";
import { IExtensionState } from "../models/state.model";
import { GistService } from "./github/gist.service";

export class FactoryService {
  public static CreateSyncService(
    state: IExtensionState,
    method: string
  ): ISyncService {
    const Service = this.syncMethods[method];
    if (!Service) {
      throw new Error("Unsupported Settings Sync storage method.");
    }
    return new Service(state);
  }
  private static syncMethods: Record<
    string,
    new (state: IExtensionState) => ISyncService
  > = {
    [SyncMethod.GitHubGist]: GistService,
    [SyncMethod.GitRepository]: GistService
  };
}
