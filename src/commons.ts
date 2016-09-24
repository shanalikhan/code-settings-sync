"use strict";
import * as vscode from 'vscode';
import {Environment} from './environmentPath';
import {File, FileManager} from './fileManager';
import {LocalSetting} from './setting';
import {PluginService, ExtensionInformation} from './pluginService';
import * as fs from 'fs';

var watch = require('node-watch');


export class Commons {

    public ERROR_MESSAGE: string = "Error Logged In Console (Help menu > Toggle Developer Tools). You may open an issue using 'Sync : Open Issue' from advance setting command.";

    private static watcher = null;

    constructor(private en: Environment) {

    }
    public LogException(error: any, message: string): void {

        console.error(error);
        vscode.window.showErrorMessage(message);
        vscode.window.setStatusBarMessage("");
    }

    public async InternetConnected(): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            resolve(true);
        });
    }

    public StartWatch(): void {
        var appSetting = this.en.APP_SETTINGS;
        var appSummary = this.en.APP_SUMMARY;
        while (appSetting.indexOf("/") > -1) {
            appSetting = appSetting.replace("/", "\\");
        }

        while (appSummary.indexOf("/") > -1) {
            appSummary = appSummary.replace("/", "\\");
        }

        Commons.watcher = watch(this.en.PATH + "/User/");

        Commons.watcher.on('change', (path) => {

            if ((path != appSetting) && (path != appSummary)) {
                if (true) {
                    (function () {
                        setTimeout(function () {
                            vscode.window.setStatusBarMessage("Updating Process Starting On File Change.");
                            vscode.commands.executeCommand('extension.updateSettings', "forceUpdate");
                        }, 5000);
                    })();

                    //return;
                }

            }

        });
    }
    public CloseWatch(): void {
        if (Commons.watcher != null) {
            Commons.watcher.close();
        }

    }


    //TODO : change any to LocalSetting after max users migrate to new settings.
    public async InitSettings(): Promise<any> {

        var me = this;
        //var localSetting: LocalSetting = new LocalSetting();
        var localSetting: any;
        vscode.window.setStatusBarMessage("Sync : Checking for Github Token and GIST.");

        return new Promise<any>(async (resolve, reject) => {

            await FileManager.FileExists(me.en.APP_SETTINGS).then(async function (fileExist: boolean) {
                if (fileExist) {
                    await FileManager.ReadFile(me.en.APP_SETTINGS).then(function (settin: string) {
                        vscode.window.setStatusBarMessage("");
                        if (settin) {
                            var set: any;
                            set = JSON.parse(settin);
                            vscode.window.setStatusBarMessage("");
                            resolve(set);
                        }
                        resolve("");

                    }, function (settingError: any) {
                        reject(settingError);
                        vscode.window.setStatusBarMessage("");
                    });
                }
                else {
                    //var set: LocalSetting = new LocalSetting();
                    var set: any = null;
                    resolve(set);
                    vscode.window.setStatusBarMessage("");
                }
            }, function (err: any) {
                reject(err);
                vscode.window.setStatusBarMessage("");
            });


        });
    }

    public async SaveSettings(setting: any): Promise<boolean> {
        var me = this;
        return new Promise<boolean>(async (resolve, reject) => {
            if (setting) {
                await FileManager.WriteFile(me.en.APP_SETTINGS, JSON.stringify(setting)).then(function (added: boolean) {
                    resolve(added);
                }, function (err: any) {
                    reject(err);
                });
            }
            else {
                console.error("SaveSettings: Setting is :" + setting);
                reject(false);
            }

        });

    }

    public async GetSettings(): Promise<Object> {
        var me = this;
        return new Promise<Object>(async (resolve, reject) => {
            await FileManager.FileExists(me.en.APP_SETTINGS).then(async function (fileExist: boolean) {
                //resolve(fileExist);
                if (fileExist) {
                    await FileManager.ReadFile(me.en.APP_SETTINGS).then(function (settingsData: string) {
                        if (settingsData) {
                            resolve(JSON.parse(settingsData));
                        }
                        else {
                            console.log(me.en.APP_SETTINGS + " not Found.");
                            resolve(null);
                        }
                    });
                }
                else {
                    console.log(me.en.APP_SETTINGS + " not Found.");
                    resolve(null);
                }


            }, function (err: any) {
                reject(err);
            });
        });
    }

    public async GetTokenAndSave(sett: LocalSetting): Promise<string> {
        var me = this;
        var opt = Commons.GetInputBox(true);
        return new Promise<string>((resolve, reject) => {
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
                                resolve(token);
                            }, function (err: any) {
                                reject(err);
                            });
                        }
                    }
                    //  else {
                    //     if (token !== 'esc') {
                    //         getToken()
                    //     }
                    // }
                });
            } ());
        });
    }
    public async GetGistAndSave(sett: LocalSetting): Promise<string> {
        var me = this;
        var opt = Commons.GetInputBox(false);
        return new Promise<string>((resolve, reject) => {
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
                                resolve(gist);
                            }, function (err: any) {
                                reject(err);
                            });
                        }
                    }
                    // else {
                    //     if (gist !== 'esc') {
                    //         getGist();
                    //     }
                    // }

                });
            })();

        });
    }


    public static GetInputBox(token: boolean) {

        if (token) {
            let options: vscode.InputBoxOptions = {
                placeHolder: "Enter Github Personal Access Token",
                password: false,
                prompt: "Link opened to get the GitHub token. Enter token and press [Enter] or press / type 'esc' to cancel.",
                ignoreFocusOut: true
            };
            return options;
        }
        else {
            let options: vscode.InputBoxOptions = {
                placeHolder: "Enter GIST ID",
                password: false,
                prompt: "Enter GIST ID from previously uploaded settings and press [Enter] or press / type 'esc' to cancel.",
                ignoreFocusOut: true
            };
            return options;
        }
    };

    public GenerateSummmaryFile(upload: boolean, files: Array<File>, removedExtensions: Array<ExtensionInformation>, addedExtensions: Array<ExtensionInformation>, syncSettings: LocalSetting) {

        var header: string = null;
        var downloaded: string = "Download";
        var updated: string = "Upload";
        var status: string = null;

        if (upload) {
            status = updated;
        }
        else {
            status = downloaded;
        }

        header = "\r\nFiles " + status + ". \r\n";

        var deletedExtension: string = "\r\nEXTENSIONS REMOVED : \r\n";
        var addedExtension: string = "\r\nEXTENSIONS ADDED : \r\n";
        var tempURI: string = this.en.APP_SUMMARY;

        console.log("FILE URI For Summary Page : " + tempURI);

        //        var setting: vscode.Uri = vscode.Uri.parse("untitled:" + tempURI);

        var setting: vscode.Uri = vscode.Uri.file(tempURI);
        fs.openSync(setting.fsPath, 'w');

        vscode.workspace.openTextDocument(setting).then((a: vscode.TextDocument) => {

            vscode.window.showTextDocument(a, 1, false).then((e: vscode.TextEditor) => {
                e.edit(edit => {
                    edit.insert(new vscode.Position(0, 0), "VISUAL STUDIO CODE SETTINGS SYNC \r\n\r\n" + status + " SUMMARY \r\n\r\n");
                    edit.insert(new vscode.Position(1, 0), "-------------------- \r\n");

                    edit.insert(new vscode.Position(2, 0), "GITHUB TOKEN: " + syncSettings.Token + " \r\n");
                    edit.insert(new vscode.Position(3, 0), "GITHUB GIST: " + syncSettings.Gist + " \r\n");
                    var type: string = (syncSettings.publicGist == true) ? "Public" : "Secret"
                    edit.insert(new vscode.Position(4, 0), "GITHUB GIST TYPE: " + type + " \r\n \r\n");
                    edit.insert(new vscode.Position(5, 0), "-------------------- \r\n  \r\n");

                    edit.insert(new vscode.Position(6, 0), header + " \r\n");
                    var row: number = 6;
                    for (var i = 0; i < files.length; i++) {
                        var element = files[i];
                        if (element.fileName.indexOf(".") > 0) {
                            edit.insert(new vscode.Position(row, 0), element.fileName + " \r\n");
                            row += 1;
                        }

                    }
                    if (removedExtensions) {
                        edit.insert(new vscode.Position(row, 0), deletedExtension + " \r\n");
                        row += 1;

                        if (removedExtensions.length > 0) {
                            removedExtensions.forEach(ext => {
                                edit.insert(new vscode.Position(row, 0), ext.name + " - Version :" + ext.version + " \r\n");
                                row += 1;
                            });
                        }
                        else {
                            edit.insert(new vscode.Position(row, 0), "No Extension needs to be removed. \r\n");
                        }
                    }

                    if (addedExtensions) {
                        row += 1;
                        edit.insert(new vscode.Position(row, 0), " \r\n" + addedExtension + " \r\n");
                        row += 1;
                        if (addedExtensions.length > 0) {
                            addedExtensions.forEach(ext => {
                                edit.insert(new vscode.Position(row, 0), ext.name + " - Version :" + ext.version + " \r\n");
                                row += 1;
                            });
                        }
                        else {
                            edit.insert(new vscode.Position(row, 0), "No Extension needs to install. \r\n");
                        }
                    }
                });
                e.document.save();
            });
        }, (error: any) => {
            console.error(error);
            return;
        });

    };


}