import { File } from './fileManager'
import { OsType, SettingType } from './enums';
import { Environment } from './environmentPath';


export class Gist {

    public gistId: string = null;
    public ownerName: string = null;
    public ownerUser: string = null;
    public files: Array<File> = null;
    public publicGist : boolean = false;

    constructor(public gistResponse : Object, private en: Environment) {
        this.ownerUser = this.gistResponse["owner"]["login"];
        this.publicGist = this.gistResponse["public"];
        this.en = en;

        var keys = Object.keys(this.gistResponse["files"]);
        keys.forEach(gistName => {
                        if (this.gistResponse["files"][gistName]) {
                            if (this.gistResponse["files"][gistName].content) {
                                if (gistName.indexOf(".") > -1) {
                                    // if (en.OsType == OsType.Mac && gistName == en.FILE_KEYBINDING_DEFAULT) {
                                    //     return;
                                    // }
                                    // if (en.OsType != OsType.Mac && gistName == en.FILE_KEYBINDING_MAC) {
                                    //     return;
                                    // }
                                    var f: File = new File(gistName, this.gistResponse["files"][gistName].content, null, gistName);
                                    this.files.push(f);
                                }
                            }
                        }
                        else {
                            console.log(gistName + " key in response is empty.");
                        }
                    });
    }

}