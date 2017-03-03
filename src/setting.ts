//"use strict";
import { Environment } from './environmentPath';


export class ExtensionConfig {

    public token: string = null;
    public gist: string = null;
    public lastUpload: Date = null;
    public autoDownload: boolean = false;
    public autoUpload = false;
    public lastDownload: Date = null;
    public version: number = null;
    public showSummary: boolean = true;
    public forceDownload: boolean = false;
    public anonymousGist: boolean = false;
    public host: string = null;
    public pathPrefix: string = null;
    constructor() {
        this.version = Environment.CURRENT_VERSION;
    }
}

export class LocalConfig {
    public publicGist: boolean = false;
    public userName: string = null;
    public name: string = null;
    public config: ExtensionConfig = null;
    constructor() {
        this.config = new ExtensionConfig();
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
    public replaceCodeSettings: Object = null;
    constructor() {
        this.ignoreUploadFiles = new Array<string>();
        this.ignoreUploadFolders = new Array<string>();
        this.replaceCodeSettings = new Object();
        this.ignoreUploadFolders.push("workspaceStorage");
        this.ignoreUploadFiles.push("projects.json");
        this.ignoreUploadFiles.push("projects_cache_git.json")
        //this.replaceCodeSettings.push(new NameValuePair("http.proxy",""));
    }
}
