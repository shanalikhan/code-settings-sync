"use strict";
import * as vscode from 'vscode';
import * as envi from './environmentPath';
import * as fManager from './fileManager';
import {Setting} from './setting';

export class Commons {

    public ERROR_MESSAGE: string = "ERROR ! Logged In Console (Help menu > Toggle Developer Tools). Please open an issue in Github Repo using 'Sync : Open Issue' command.";

    constructor(private en: envi.Environment) {

    }

    public async InitSettings(): Promise<Setting> {

        var me = this;
        var setting: Setting = new Setting();

        return new Promise<Setting>(async (resolve, reject) => {

            await fManager.FileManager.FileExists(me.en.APP_SETTINGS).then(async function (fileExist: boolean) {
                if (fileExist) {
                    await fManager.FileManager.ReadFile(me.en.APP_SETTINGS).then(function (settin: string) {
                        var set: Setting = JSON.parse(settin);
                        resolve(set);
                    }, function (settingError: any) {
                        reject(settingError);
                    });
                }
                else {
                    var set: Setting = new Setting();
                    resolve(set);
                }
            }, function (err: any) {
                reject(err);
            });


        });
    }

    public async SaveSettings(setting: Setting): Promise<boolean> {
        var me = this;
        return new Promise<boolean>(async (resolve, reject) => {
            await fManager.FileManager.WriteFile(me.en.APP_SETTINGS, JSON.stringify(setting)).then(function (added: boolean) {
                resolve(added);
            }, function (err: any) {
                reject(err);
            });
        });

    }

    public async GetSettings(): Promise<Object> {
        var me = this;
        return new Promise<Object>(async (resolve, reject) => {
            await fManager.FileManager.FileExists(me.en.APP_SETTINGS).then(async function (fileExist: boolean) {
                //resolve(fileExist);
                if (fileExist) {
                    await fManager.FileManager.ReadFile(me.en.APP_SETTINGS).then(function (settingsData: string) {
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


            }, function (err: any) {
                reject(err);
            });
        });
    }

    public async GetTokenAndSave(sett: Setting): Promise<boolean> {
        var me = this;
        var opt = Commons.GetInputBox(true);
        return new Promise<boolean>((resolve, reject) => {
            (function getToken() {
                vscode.window.showInputBox(opt).then(async (token) => {
                    if (token && token.trim()) {
                        token = token.trim();

                        if (token != 'esc') {
                            sett.Token = token;
                            await me.SaveSettings(sett).then(function (saved: boolean) {
                                if (saved) {
                                    vscode.window.setStatusBarMessage("Sync : Token Saved", 1000);
                                }
                                resolve(saved);
                            }, function (err: any) {
                                reject(err);
                            });
                        }
                    } else {
                        if (token !== 'esc') {
                            getToken()
                        }
                    }
                });
            } ());
        });
    }
    public async GetGistAndSave(sett: Setting): Promise<boolean> {
        var me = this;
        var opt = Commons.GetInputBox(false);
        return new Promise<boolean>((resolve, reject) => {
            (function getGist() {
                vscode.window.showInputBox(opt).then(async (gist) => {
                    if (gist && gist.trim()) {
                        gist = gist.trim();
                        if (gist != 'esc') {
                            sett.Gist = gist.trim();
                            await me.SaveSettings(sett).then(function (saved: boolean) {
                                if (saved) {
                                    vscode.window.setStatusBarMessage("Sync : Gist Saved", 1000);
                                }
                                resolve(saved);
                            }, function (err: any) {
                                reject(err);
                            });
                        }

                    } else {
                        if (gist !== 'esc') {
                            getGist();
                        }
                    }

                });
            })();

        });
    }


    public static GetInputBox(token: boolean) {

        if (token) {
            let options: vscode.InputBoxOptions = {
                placeHolder: "Enter Github Personal Access Token",
                password: false,
                prompt: "Link is opened to get the github token. Enter token and press [Enter] or type 'esc' to cancel."
            };
            return options;
        }
        else {
            let options: vscode.InputBoxOptions = {
                placeHolder: "Enter GIST ID",
                password: false,
                prompt: "Enter GIST ID from previously uploaded settings and press [Enter] or type 'esc' to cancel."
            };
            return options;
        }
    };

}