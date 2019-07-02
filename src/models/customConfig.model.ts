import { Environment } from "../environment";
import { GistConfig } from "./gistConfig.model";
import { SyncMethod } from "./sync-method.model";

export class CustomConfig {
  public ignoreUploadFiles: string[] = [
    "state.*",
    "syncLocalSettings.json",
    ".DS_Store",
    "sync.lock",
    "projects.json",
    "projects_cache_vscode.json",
    "projects_cache_git.json",
    "projects_cache_svn.json",
    "gpm_projects.json",
    "gpm-recentItems.json"
  ];
  public exportType: SyncMethod = SyncMethod.GitHubGist;
  public GitHubGist = new GistConfig();
  public ignoreUploadFolders: string[] = ["workspaceStorage"];
  public ignoreExtensions: string[] = [];
  public version: number = Environment.CURRENT_VERSION;
  public supportedFileExtensions: string[] = ["json", "code-snippets"];
  public disableUpdateMessage: boolean = false;
  public customFiles: { [key: string]: string } = {};
  public hostName: string = null;
  public universalKeybindings: boolean = false;
  public autoUploadDelay: number = 20;
}
