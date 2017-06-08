import { File } from './fileManager'
import { OsType, SettingType } from './enums';
import { Environment } from './environmentPath';


export class Gist {

    public gistId: string = null;
    public ownerName: string = null;
    public ownerUser: string = null;
    public files: Array<File> = null;
    public publicGist: boolean = false;

    constructor(public gistResponse: Object, private en: Environment) {

        this.files = new Array<File>();

        if (gistResponse != null) {

            let gistKeys = Object.keys(this.gistResponse);
            if (gistKeys.indexOf("owner") > -1) {
                this.ownerUser = this.gistResponse["owner"]["login"];
            }
            if (gistKeys.indexOf("public") > -1) {
                this.publicGist = this.gistResponse["public"];
            }
            if (gistKeys.indexOf("files") > -1) {
                var keys = Object.keys(this.gistResponse["files"]);
                keys.forEach(gistName => {
                    if (this.gistResponse["files"][gistName]) {
                        if (this.gistResponse["files"][gistName].content) {
                            //if (gistName.indexOf(".") > -1) {
                            // if (en.OsType == OsType.Mac && gistName == en.FILE_KEYBINDING_DEFAULT) {
                            //     return;
                            // }
                            // if (en.OsType != OsType.Mac && gistName == en.FILE_KEYBINDING_MAC) {
                            //     return;
                            // }
                            var f: File = new File(gistName, this.gistResponse["files"][gistName].content, null, gistName);
                            this.files.push(f);
                            //}
                        }
                    }
                    else {
                        console.log("Sync : "+ gistName + " key in response is empty.");
                    }
                });
            }
        }
    }
    public Add(f: File): void {

        this.files.push(f);
    }

}