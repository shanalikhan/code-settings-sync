//"use strict";
import { Environment } from '../common/environmentPath';


export class CustomSetting {
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
        this.ignoreUploadFiles.push("projects_cache_git.json")
        this.gistDescription = "Visual Studio Code Settings Sync Gist";
        this.version = Environment.CURRENT_VERSION;
        this.token = "";
    }
}
