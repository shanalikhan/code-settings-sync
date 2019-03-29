"use strict";
import { Environment } from "./environmentPath";

export class ExtensionConfig {
  public gist: string = null;
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

export class KeyValue<T, S> {
  constructor(public Key: T, public Value: S) {}
}

export class CustomSettings {
  public repoSettings = {
    ignoredItems: [
      "syncLocalSettings",
      "workspaceStorage",
      "globalStorage/state.vscdb"
    ],
    repo: ""
  };
  public gistSettings = {
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
  public ignoreExtensions: string[] = [];
  public version: number = Environment.CURRENT_VERSION;
  public disableUpdateMessage: boolean = false;
  public hostName: string = null;
  public method: "repo" | "gist" = null;
}
