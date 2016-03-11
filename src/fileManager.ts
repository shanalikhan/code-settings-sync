"use strict";
var fs = require('fs');
export class FileManager {
    
    public static FileExists(filePath: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            var stat: boolean = fs.existsSync(filePath);
            if (stat) {
                resolve(stat);
            }
            else resolve(stat);

        });
    }

    public static ReadFile(filePath: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            fs.readFile(filePath, { encoding: 'utf8' }, function(err: any, data: any) {
                if (err) {
                    //vscode.window.showErrorMessage(ERROR_MESSAGE);
                    console.error(err);
                    reject(null);
                }
                resolve(data);

            });
        });
    }
    public static WriteFile(filePath : string , data : string) : Promise<boolean>{
         return new Promise<boolean>((resolve, reject) => {
                if (data) {
                    
                    fs.writeFile(filePath, data, function(err: any, data: any) {
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