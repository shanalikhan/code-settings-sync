import {Environment} from './environmentPath';

"use strict";
export class LocalSetting{
    public Token : string = null;
    public Gist : string = null;
    public lastUpload : Date = null;       
    public firstTime : boolean = true;  // to open the toturial first time when used any command.
    public autoDownload : boolean = false;
    public lastDownload : Date = null;
    public Version : number = null;
    public showSummary : boolean = true;
    public allowUpload : boolean = true;
    public publicGist = false;
    public forceDownload = false;
    public showLog = false;
    public autoUpload = true;
}

export class CloudSetting{
    public lastUpload : Date = null;
}

export class OldSetting{
     public Token : string = null;
    public Gist : string = null;
    public Migrated:boolean  = true;
    public ProxyIP :string = null;
    public ProxyPort:string = null;
}