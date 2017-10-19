//"use strict";
import { Environment } from './environmentPath';


export class ExtensionConfig {

    public gist: string = null;
    public lastUpload: Date = null;
    public autoDownload: boolean = false;
    public autoUpload = false;
    public lastDownload: Date = null;
    public forceDownload: boolean = false;
    public anonymousGist: boolean = false;
    public host: string = null;
    public pathPrefix: string = null;
    public quietSync: boolean = false;
    public askGistName: boolean = false;

}

export class LocalConfig {
    public publicGist: boolean = false;
    public userName: string = null;
    public name: string = null;
    public extConfig: ExtensionConfig = null;
    public customConfig: CustomSettings = null;

    constructor() {
        this.extConfig = new ExtensionConfig();
        this.customConfig = new CustomSettings();
    }
}

export class CloudSetting {
    public lastUpload: Date = null;
    public extensionVersion: string = null;
    constructor() {
        this.extensionVersion = "v" + Environment.getVersion();
    }
}


export class CustomSettings {
    public ignoreUploadFiles: Array<string> = null;
    public ignoreUploadFolders: Array<string> = null;
    public ignoreUploadSettings: Array<string> = null;
    public replaceCodeSettings: Object = null;
    public gistDescription: string = null;
    public version: number = 0;
    public token: string = null;
    constructor() {

        this.ignoreUploadFiles = new Array<string>();
        this.ignoreUploadFolders = new Array<string>();
        this.replaceCodeSettings = new Object();
        this.ignoreUploadSettings = new Array<string>();
        this.ignoreUploadFolders.push("workspaceStorage");
        this.ignoreUploadFiles.push("projects.json");
        this.ignoreUploadFiles.push("projects_cache_vscode.json")
        this.ignoreUploadFiles.push("projects_cache_git.json")
        this.ignoreUploadFiles.push("projects_cache_svn.json")
        this.ignoreUploadFiles.push("gpm_projects.json")
        this.ignoreUploadFiles.push("gpm-recentItems.json")
        this.gistDescription = "Visual Studio Code Settings Sync Gist";
        this.version = Environment.CURRENT_VERSION;
        this.token = "";
    }
}
