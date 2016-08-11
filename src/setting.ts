"use strict";
export class LocalSetting{
    public Token : string = null;
    public Gist : string = null;
    public lastUpload : Date = null;       
    public firstTime : boolean = true;  // to open the toturial first time when used any command.
    public autoSync : boolean = true;
    public lastDownload : Date = null;
}

export class CloudSetting
{
    public lastUpload : Date = null;
}