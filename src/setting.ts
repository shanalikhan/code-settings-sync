//"use strict";
import {Environment} from './environmentPath';


export class LocalSetting {

    public Token: string = null;
    public Gist: string = null;
    public lastUpload: Date = null;
    public firstTime: boolean = true;  // to open the toturial first time when used any command.
    public autoDownload: boolean = false;
    public autoUpload = false;
    public allowUpload: boolean = true;
    public lastDownload: Date = null;
    public Version: number = null;
    public showSummary: boolean = true;
    public publicGist = false;
    public forceDownload = false;

    constructor(){
        this.Version = Environment.CURRENT_VERSION;

    }

}

export class CloudSetting {
    public lastUpload: Date = null;
}
