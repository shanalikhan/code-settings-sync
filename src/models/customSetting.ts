//"use strict";
import { Environment } from '../common/environmentPath';
import {TaskType} from '../common/enums';


export class CustomSetting {
    public ignoreUploadFiles: Array<string> = null;
    public ignoreUploadFolders: Array<string> = null;
    public ignoreUploadSettings: Array<string> = null;
    public replaceCodeSettings: Object = null;
    public gistSettings : GistExportCustomSetting = null;
    public fileSettings : FileExportCustomSetting = null;
    public type : TaskType = null;
    //public gistDescription: string = null;
    public version: number = 0;
    //public token: string = null;
    constructor() {
        this.type = TaskType.GitHub;
        this.ignoreUploadFiles = new Array<string>();
        this.ignoreUploadFolders = new Array<string>();
        this.replaceCodeSettings = new Object();
        this.ignoreUploadSettings = new Array<string>();
        this.ignoreUploadFolders.push("workspaceStorage");
        this.ignoreUploadFiles.push("projects.json");
        this.ignoreUploadFiles.push("projects_cache_git.json")
        //this.gistDescription = "Visual Studio Code Settings Sync Gist";
        this.version = Environment.CURRENT_VERSION;
        //this.token = "";
        this.fileSettings = new FileExportCustomSetting();
        this.gistSettings = new GistExportCustomSetting();
    }
}

export class FileExportCustomSetting {
    public filePath: string = null;
    constructor() {

    }
}

export class GistExportCustomSetting {
    public token: string = null;
    public gistDescription: string = null;
    public gistCollection: Array<string> = null;
    constructor() {
        this.token = "";
        this.gistDescription = "Visual Studio Code Settings Sync Gist";
        this.gistCollection = new Array<string>();
    }
}
