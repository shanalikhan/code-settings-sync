import { File, FileManager } from './manager/fileManager';
import { OsType, SettingType } from './common/enums';
import { Environment } from './common/environmentPath';


export class Gist {

    private gistId: string = null;
    private ownerName: string = null;
    private ownerUser: string = null;
    private files: Array<File> = null;
    private publicGist: boolean = false;

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
                            var f: File = new File(gistName, this.gistResponse["files"][gistName].content, null, gistName);
                            this.files.push(f);
                        }
                    }
                    else {
                        console.log("Sync : "+ gistName + " key in response is empty.");
                    }
                });
            }
        }
    }
    public AddFile(f: File): void {
        this.files.push(f);
    }

    public GetOwnerUser(): string{
        return this.ownerUser;
    }

    public GetOwnerName(): string{
        return this.ownerName;
    }

    public IsPublic() : boolean{
        return this.publicGist;
    }

}