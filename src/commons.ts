"use strict";
import * as vscode from 'vscode';
import * as envi from './environmentPath';
import * as fManager from './fileManager';
import {Setting} from './setting';

export class Commons {

    public ERROR_MESSAGE: string = "ERROR ! Logged In Console. Please open an issue in Github Repo.";

    constructor(private en: envi.Environment) {

    }
    public async InitSettings(): Promise<Setting> {
        
        var me = this;
        var setting : Setting = new Setting();
        setting.Migrated = false;
        
        return new Promise<Setting>(async (resolve, reject) => {

            await fManager.FileManager.FileExists(me.en.APP_SETTINGS).then(async function(fileExist: boolean) {
                if (fileExist) {
                    await fManager.FileManager.ReadFile(me.en.APP_SETTINGS).then(function(settin: string) {
                        var set : Setting = JSON.parse(settin);
                        resolve(set);
                    }, function(settingError: any) {
                        reject(settingError);
                    });
                }
                else {
                    
                    // check for migration process by creating new file and adding old settings there.
                    
                    var oldToken = null;
                    var oldGist = null;

                    await fManager.FileManager.FileExists(me.en.FILE_TOKEN).then(async function(tokenExist: boolean) {
                        if (tokenExist) {
                            await fManager.FileManager.ReadFile(me.en.FILE_TOKEN).then(async function(token: string) {
                                if (token) {
                                    oldToken = token;
                                }

                            }, function(tokenErr: any) {
                                reject(tokenErr);
                            });
                        }
                        else {
                            oldToken = null;
                        }


                    }, function(err: any) {
                        reject(err);
                    });



                    await fManager.FileManager.FileExists(me.en.FILE_GIST).then(async function(gistExist: boolean) {
                        if (gistExist) {
                            await fManager.FileManager.ReadFile(me.en.FILE_GIST).then(async function(gist: string) {
                                if (gist) {
                                    oldGist = gist;
                                }

                            }, function(tokenErr: any) {
                                reject(tokenErr);
                            });
                        }
                        else {
                            oldGist = null;
                        }


                    }, function(err: any) {
                        reject(err);
                    });

                    setting.Gist = oldGist;
                    setting.Token = oldToken;
                    setting.Migrated = true;

                    await fManager.FileManager.WriteFile(me.en.APP_SETTINGS, JSON.stringify(setting)).then(function(added: boolean) {
                        resolve(setting);
                    }, function(err: any) {
                        reject(err);
                    });

                }
            }, function(err: any) {
                reject(err);
            });


        });
    }
    public async GetSettings(): Promise<Object> {
        var me = this;
        return new Promise<Object>(async (resolve, reject) => {
            await fManager.FileManager.FileExists(me.en.APP_SETTINGS).then(async function(fileExist: boolean) {
                //resolve(fileExist);
                if (fileExist) {
                    await fManager.FileManager.ReadFile(me.en.APP_SETTINGS).then(function(settingsData: string) {
                        if (settingsData) {
                            resolve(JSON.parse(settingsData));
                        }
                        else {
                            console.error(me.en.APP_SETTINGS + " not Found.");
                            resolve(null);
                        }
                    });
                }
                else {
                    resolve(null);
                }


            }, function(err: any) {
                reject(err);
            });
        });
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
                        resolve(added);
                    }, function(error: any) {
                        vscode.window.showErrorMessage(me.ERROR_MESSAGE);
                        reject(error);
                    });
                }
            });
        });
    }
    public GetGistAndSave(): Promise<boolean> {
        var me = this;
        var opt = Commons.GetInputBox(false);
        return new Promise<boolean>((resolve, reject) => {
            vscode.window.showInputBox(opt).then((gist) => {
                gist = gist.trim();
                if (gist) {
                    fManager.FileManager.WriteFile(me.en.FILE_GIST, gist).then(function(added: boolean) {
                        vscode.window.setStatusBarMessage("Gist Saved.", 1000);
                        resolve(added);
                    }, function(error: any) {
                        vscode.window.showErrorMessage(me.ERROR_MESSAGE);
                        reject(error);
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