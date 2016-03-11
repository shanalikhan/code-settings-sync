"use strict";
export class FileManager {
    private fs = null;
   constructor() {
        this.fs = require('fs');
    }
    public FileExists(filePath: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            var stat: boolean = this.fs.existsSync(filePath);
            if (stat) {
                resolve(stat);
            }
            else resolve(stat);

        });
    }

    public ReadFile(filePath: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            this.fs.readFile(filePath, { encoding: 'utf8' }, function(err: any, data: any) {
                if (err) {
                    //vscode.window.showErrorMessage(ERROR_MESSAGE);
                    console.error(err);
                    reject(null);
                }
                resolve(data);

            });
        });
    }
    public WriteFile(filePath : string , data : string) : Promise<boolean>{
         return new Promise<boolean>((resolve, reject) => {
                if (data) {
                    
                    this.fs.writeFile(filePath, data, function(err: any, data: any) {
                        if (err) {
                            //vscode.window.showErrorMessage(ERROR_MESSAGE);
                            console.error(err);
                            reject(false);
                        }
                        else {
                            //TOKEN = token;
                            resolve(true);
                        }

                    });
                }
                else {
                    //vscode.window.showErrorMessage(ERROR_MESSAGE);
                    console.error("DATA is EMPTY for "+ filePath);
                    reject(false);
                }

            });
    }
}