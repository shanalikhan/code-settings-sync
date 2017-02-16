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
    //public workspaceSync: boolean = false;
    public anonymousGist: boolean = false;
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
export class NameValuePair {
    constructor(public name: string, public value: string) {
    }
}

export class CustomSettings {
    public ignoreFiles: Array<string> = null;
    public ignoreFolders: Array<string> = null;
    public ignoreCodeSettings: Array<NameValuePair> = null;
    constructor() {
        this.ignoreFiles = new Array<string>();
        this.ignoreFolders = new Array<string>();
        this.ignoreCodeSettings = new Array<NameValuePair>();
        this.ignoreFolders.push("workspaceStorage")
        //this.ignoreCodeSettings.push(new NameValuePair("http.proxy",""));
    }
}
