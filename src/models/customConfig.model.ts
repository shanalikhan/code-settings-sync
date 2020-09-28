import { state } from "../state";
import { GitHubConfig } from "./github/github.model";

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
    "gpm-recentItems.json",
  ];
  public ignoreUploadFolders: string[] = ["workspaceStorage", "globalStorage"];
  public ignoreExtensions: string[] = [];
  public githubSettings: GitHubConfig = new GitHubConfig();

  public version: number = Number(
    state.environment.getVersion().split(".").join("")
  );
  public supportedFileExtensions: string[] = ["json", "code-snippets"];
  public disableUpdateMessage: boolean = false;
  public customFiles: { [key: string]: string } = {};
  public hostName: string = null;
  public universalKeybindings: boolean = false;
  public autoUploadDelay: number = 20;
  public sortAlphabetically: boolean = false;
}
