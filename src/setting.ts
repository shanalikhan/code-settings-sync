import {Environment} from './environmentPath';

"use strict";
export class LocalSetting{
    public Token : string = null;
    public Gist : string = null;
    public lastUpload : Date = null;       
    public firstTime : boolean = true;  // to open the toturial first time when used any command.
    public autoSync : boolean = true;
    public lastDownload : Date = null;
    public ProxyIP :string = null;
    public ProxyPort:string = null;
    public Version : number = null;
    public showSummary : boolean = true;
    public allowUpload : boolean = true;
    public publicGist = false;
    public forceDownload = false;
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