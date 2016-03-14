"use strict";
var fs = require('fs');

export class File {
    public fileName: string = null;
    constructor(private file: string, public content: string, private filePath) {
        this.fileName = file.split('.')[0];
    }
}
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
            this.FileExists(filePath).then(function(fileExists: boolean) {
                if (fileExists) {
                    fs.readFile(filePath, { encoding: 'utf8' }, function(err: any, data: any) {
                        if (err) {
                            console.error(err);
                            reject(err);
                        }
                        resolve(data);

                    });
                }
                else {
                    reject("File Not Exists");
                }
            });


        });
    }
    public static WriteFile(filePath: string, data: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            if (data) {
                fs.writeFile(filePath, data, function(err: any, data: any) {
                    if (err) {
                        console.error(err);
                        reject(false);
                    }
                    else {
                        resolve(true);
                    }
                });
            }
            else {
                console.error("DATA is EMPTY for " + filePath);
                reject(false);
            }
        });
    }

    public static async ListFiles(directory: string): Promise<Array<File>> {
        var me = this;
        return new Promise<Array<File>>((resolve, reject) => {
            fs.readdir(directory, async function(err: any, data: Array<string>) {
                if (err) {
                    console.error(err);
                    reject(null);
                }

                var files = new Array<File>();
                for (var i = 0; i < data.length; i++) {
                    var fileName = data[i];
                    var filePath = directory.concat(fileName);
                    var fileContent = await me.ReadFile(filePath);
                    var file: File = new File(fileName, fileContent, filePath);
                    files.push(file);
                }
                resolve(files);
            });

        });
    }

    public static async DeleteFile(filePath: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            if (filePath) {
                this.FileExists(filePath).then(async function(fileExists: boolean) {
                    if (fileExists) {
                        await fs.unlinkSync(filePath);
                    }
                    resolve(true);
                });
            }
            else {
                console.error("DATA is EMPTY for " + filePath);
                reject(false);
            }
        });
    }

    public static async CreateDirectory(name: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            if (name) {
                this.FileExists(name).then(async function(dirExist: boolean) {
                    if (!dirExist) {
                        await fs.mkdirSync(name);

                    }
                    resolve(true);
                });
            }
            else {
                console.error("DATA is EMPTY for " + name);
                reject(false);
            }
        });
    }

}