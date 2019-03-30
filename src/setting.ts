"use strict";
import { Environment } from "./environmentPath";

export class ExtensionConfig {
  public quietSync: boolean = false;
  public removeExtensions: boolean = true;
  public syncExtensions: boolean = true;
  public autoDownload: boolean = false;
  public autoUpload = false;
  public forceDownload: boolean = false;
}

export class LocalConfig {
  public publicGist: boolean = false;
  public userName: string = null;
  public name: string = null;
  public extConfig: ExtensionConfig = new ExtensionConfig();
  public customConfig: CustomSettings = new CustomSettings();
}

export class CloudSetting {
  public lastUpload: Date = null;
  public extensionVersion: string = "v" + Environment.getVersion();
}

export class CustomSettings {
  public repoSettings = {
    ignoredItems: [
      "syncLocalSettings",
      "workspaceStorage",
      "globalStorage/state.vscdb"
    ],
    repo: "",
    token: "",
    username: ""
  };
  public gistSettings = {
    gist: "",
    ignoreUploadFiles: [
      "projects.json",
      "projects_cache_vscode.json",
      "projects_cache_git.json",
      "projects_cache_svn.json",
      "gpm_projects.json",
      "gpm-recentItems.json"
    ],
    ignoreUploadFolders: ["workspaceStorage"],
    customFiles: {},
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
  public ignoredExtensions: string[] = [];
  public version: number = Environment.CURRENT_VERSION;
  public disableUpdateMessage: boolean = true;
  public hostName: string = null;
  public syncMethod: "repo" | "gist" = "gist";
}
