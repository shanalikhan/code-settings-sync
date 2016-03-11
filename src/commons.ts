"use strict";
import * as vscode from 'vscode';
import * as envi from './environmentPath';
import * as fManager from './fileManager';

export class Commons {

    public ERROR_MESSAGE: string = "ERROR ! Logged In Console. Please open an issue in Github Repo.";

    constructor(private en: envi.Environment) {

    }

    public TokenFileExists(): Promise<boolean> {
        var me = this;
        return new Promise<boolean>((resolve, reject) => {
            fManager.FileManager.FileExists(me.en.FILE_TOKEN).then(function(fileExist: boolean) {
                resolve(fileExist);

            }, function(err: any) {
                reject(false);
            });
        });
    }

    public GISTFileExists(): Promise<boolean> {
        var me = this;
        return new Promise<boolean>((resolve, reject) => {
            fManager.FileManager.FileExists(me.en.FILE_GIST).then(function(fileExist: boolean) {
                resolve(fileExist);

            }, function(err: any) {
                reject(false);
            });
        });
    }

    public FilesExist(): Promise<boolean> {
        var me = this;
        return new Promise<boolean>((resolve, reject) => {
            fManager.FileManager.FileExists(me.en.FILE_TOKEN).then(function(fileExist: boolean) {
                if (!fileExist) {
                    resolve(false);
                }
                else {
                    fManager.FileManager.FileExists(me.en.FILE_GIST).then(function(gistfileExist: boolean) {
                        resolve(fileExist && gistfileExist);
                    }, function(err: any) {
                        reject(false);
                    });
                }
            }, function(err: any) {
                reject(false);
            });
        });

    }

    public TokenGistExist(): Promise<boolean> {
        var me = this;
        return new Promise<boolean>((resolve, reject) => {
            this.TokenFileExists().then(function(Texist: boolean) {
                me.GISTFileExists().then(function(gistExists: boolean) {
                    resolve(Texist && gistExists);
                });

            });
        });
    }

    public GetTokenAndSave(): Promise<boolean> {
        var me = this;
        var opt = Commons.GetInputBox(true);
        return new Promise<boolean>((resolve, reject) => {
            vscode.window.showInputBox(opt).then((token) => {
                token = token.trim();
                if (token) {
                    fManager.FileManager.WriteFile(me.en.FILE_TOKEN, token).then(function(added: boolean) {
                        vscode.window.setStatusBarMessage("Token Saved.", 1000);
                    }, function(error: any) {
                        vscode.window.showErrorMessage(me.ERROR_MESSAGE);
                    });
                }
            });
        });
    }
    public GetGistAndSave(): Promise<boolean> {
        var me = this;
        var opt = Commons.GetInputBox(true);
        return new Promise<boolean>((resolve, reject) => {
            vscode.window.showInputBox(opt).then((gist) => {
                gist = gist.trim();
                if (gist) {
                    fManager.FileManager.WriteFile(me.en.FILE_GIST, gist).then(function(added: boolean) {
                        vscode.window.setStatusBarMessage("Gist Saved.", 1000);
                    }, function(error: any) {
                        vscode.window.showErrorMessage(me.ERROR_MESSAGE);
                    });
                }
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