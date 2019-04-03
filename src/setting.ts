"use strict";
import { Environment } from "./environmentPath";

export class ExtensionConfig {
  public gist: string = null;
  public repoUrl: string = null;
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

export class GistSettings {
  public token: string = "";
  public hostName: string = null;
  public askGistName: boolean = false;
  public downloadPublicGist: boolean = false;
  public gistDescription: string = "Visual Studio Code Settings Sync Gist";
}

export class GitSettings {
  public github: RepoServiceSettings = new RepoServiceSettings();
  public gitlab: RepoServiceSettings = new RepoServiceSettings();
}

export class RepoServiceSettings {
  public token: string = "";
  public forcePush: boolean = true;
  public forcePull: boolean = true;
  public gitBranch: string = "master";
}

export class SyncMode {
  public type: "gist" | "git" = "gist";
  public gitClient: "github" | "gitlab" = "github";
}

export class CustomSettings {
  public ignoreUploadFiles: string[] = [
    "projects.json",
    "projects_cache_vscode.json",
    "projects_cache_git.json",
    "projects_cache_svn.json",
    "gpm_projects.json",
    "gpm-recentItems.json"
  ];
  public ignoreUploadFolders: string[] = ["workspaceStorage"];
  public ignoreExtensions: string[] = [];
  public ignoreUploadSettings: string[] = [];
  public replaceCodeSettings: { [key: string]: any } = {};
  public version: number = Environment.CURRENT_VERSION;
  public gistSettings: GistSettings = new GistSettings();
  public gitSettings: GitSettings = new GitSettings();
  public supportedFileExtensions: string[] = ["json", "code-snippets"];
  public openTokenLink: boolean = true;
  public disableUpdateMessage: boolean = false;
  public lastUpload: Date = null;
  public lastDownload: Date = null;
  public githubEnterpriseUrl: string = null;
  public customFiles: { [key: string]: string } = {};
  public syncMode: SyncMode = new SyncMode();
}
