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

export class CustomSettings {
  public repoSettings = {
    repo: "",
    token: "",
    username: ""
  };
  public gistSettings = {
    gist: "",
    customFiles: [],
    githubEnterpriseUrl: null,
    askGistName: false,
    downloadPublicGist: false,
    token: "",
    supportedFileExtensions: ["json", "code-snippets"],
    openTokenLink: true,
    gistDescription: "Visual Studio Code Settings Sync Gist",
    lastUpload: null,
    lastDownload: null,
    ignoreUploadSettings: []
  };
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
  public quietSync: boolean = true;
  public removeExtensions: boolean = true;
  public syncExtensions: boolean = true;
  public disableUpdateMessage: boolean = true;
}
