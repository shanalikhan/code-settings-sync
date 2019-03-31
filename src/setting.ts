"use strict";
import { Environment } from "./environmentPath";

export class LocalConfig {
  public publicGist: boolean = false;
  public userName: string = "";
  public name: string = "";
  public customConfig: CustomSettings = new CustomSettings();
}

export class CloudSetting {
  public lastUpload: Date = null;
  public extensionVersion: string = "v" + Environment.getVersion();
}

export class CustomFile {
  public filename: string;
  public path: string;
}

export class GistSettings {
  public gist: string = "";
  public customFiles: CustomFile[] = [];
  public githubEnterpriseUrl: string = "";
  public askGistName: boolean = false;
  public downloadPublicGist: boolean = false;
  public token: string = "";
  public supportedFileExtensions: string[] = ["json", "code-snippets"];
  public openTokenLink: boolean = true;
  public gistDescription: string = "Visual Studio Code Settings Sync Gist";
  public lastUpload: Date = null;
  public lastDownload: Date = null;
}

export class RepoSettings {
  public repo: string = "";
  public token: string = "";
  public username: string = "";
}

export class CustomSettings {
  public repoSettings = new RepoSettings();
  public gistSettings = new GistSettings();
  public ignoredItems = [
    ".git",
    "syncLocalSettings.json",
    "sync.lock",
    "workspaceStorage",
    "globalStorage/state.vscdb",
    "globalStorage/state.vscdb.backup",
    "projects.json",
    "projects_cache_vscode.json",
    "projects_cache_git.json",
    "projects_cache_svn.json",
    "gpm_projects.json",
    "gpm-recentItems.json"
  ];
  public version: number = Environment.CURRENT_VERSION;
  public hostname: string = "";
  public ignoredExtensions: string[] = [];
  public syncMethod: "repo" | "gist" = "gist";
  public autoDownload: boolean = false;
  public autoUpload: boolean = false;
  public forceDownload: boolean = false;
  public quietSync: boolean = false;
  public removeExtensions: boolean = true;
  public syncExtensions: boolean = true;
  public disableUpdateMessage: boolean = true;
}
