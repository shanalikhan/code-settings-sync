import { SyncMethod } from "../models/sync-method.model";
import { ISyncService } from "../models/sync.model";
import { GistService } from "./gist.service";

export class FactoryService {
  public static CreateSyncService(method: string): ISyncService {
    return new this.syncMethods[method]();
  }
  private static syncMethods = {
    [SyncMethod.GitHubGist]: GistService
  };
}
