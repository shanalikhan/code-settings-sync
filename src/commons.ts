"use strict";
import * as vscode from 'vscode';
import * as envi from './environmentPath';
import * as fManager from './fileManager';

export class Commons {


    constructor(private en: envi.Environment, private fManager: fManager.FileManager) {

    }

    public FilesExist(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.fManager.FileExists(this.en.FILE_TOKEN).then(function(fileExist: boolean) {
                if (!fileExist) {
                    resolve(false);
                }
                else {
                    this.fManager.FileExists(this.en.FILE_GIST).then(function(gistfileExist: boolean) {
                        if (!gistfileExist) {
                            resolve(false);
                        }
                        else {
                            resolve(true);
                        }
                    }, function(err: any) {
                        reject(false);
                    });
                }
            }, function(err: any) {
                reject(false);
            });
        });

    }


    public static GetInputBox(token: boolean) {

        if (token) {
            let options: vscode.InputBoxOptions = {
                placeHolder: "Enter Github Personal Access Token",
                password: false,
                prompt: "Link is opened to get the github token."
            };
            return options;
        }
        else {
            let options: vscode.InputBoxOptions = {
                placeHolder: "Enter GIST ID",
                password: false,
                prompt: "If you never upload the files in any machine before then upload it before."
            };
            return options;
        }
    };

}