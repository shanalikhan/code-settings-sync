"use strict";
import * as vscode from 'vscode';
import { Environment } from './environmentPath';
import { File, FileManager } from './fileManager';
import { LocalSetting } from './setting';
import { PluginService, ExtensionInformation } from './pluginService';
import * as fs from 'fs';

var openurl = require('open');
var chokidar = require('chokidar');

export class Commons {

    public ERROR_MESSAGE: string = "Error Logged In Console (Help menu > Toggle Developer Tools). You may open an issue using 'Sync : Open Issue' from advance setting command.";

    private static configWatcher = null;
    private static extensionWatcher = null;

    constructor(private en: Environment, private context: vscode.ExtensionContext) {

    }

    public LogException(error: any, message: string, msgBox: boolean): void {

        if (error) {
            console.error(error);
            if (error.code == 500) {
                message = "Sync : Internet Not Connected or Unable to Connect to Github. Exception Logged in Console";
                msgBox = false;
            }
        }
        vscode.window.setStatusBarMessage("");
        
        if (msgBox == true) {
            vscode.window.showErrorMessage(message);
        }
        else {

            vscode.window.setStatusBarMessage(message, 5000);
        }
    }

    public async InternetConnected(): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            resolve(true);
        });
    }

    public StartWatch(): void {

        let uploadStopped: boolean = true;

        Commons.extensionWatcher = chokidar.watch(this.en.ExtensionFolder, { depth: 0, ignoreInitial: true });
        Commons.configWatcher = chokidar.watch(this.en.PATH + "/User/", { ignoreInitial: true });

        //TODO : Uncomment the following lines when code allows feature to update Issue in github code repo - #14444

        // Commons.extensionWatcher.on('addDir', (path, stat)=> {
        //     if (uploadStopped) {
        //         uploadStopped = false;
        //         this.InitiateAutoUpload().then((resolve) => {
        //             uploadStopped = resolve;
        //         }, (reject) => {
        //             uploadStopped = reject;
        //         });
        //     }
        //     else {
        //         vscode.window.setStatusBarMessage("");
        //         vscode.window.setStatusBarMessage("Sync : Updating In Progres... Please Wait.", 3000);
        //     }
        // });
        // Commons.extensionWatcher.on('unlinkDir', (path)=> {
        //     if (uploadStopped) {
        //         uploadStopped = false;
        //         this.InitiateAutoUpload().then((resolve) => {
        //             uploadStopped = resolve;
        //         }, (reject) => {
        //             uploadStopped = reject;
        //         });
        //     }
        //     else {
        //         vscode.window.setStatusBarMessage("");
        //         vscode.window.setStatusBarMessage("Sync : Updating In Progres... Please Wait.", 3000);
        //     }
        // });

        Commons.configWatcher.on('change', (path: string) => {
            if (uploadStopped) {

                uploadStopped = false;
                let requiredFileChanged: boolean = false;

                requiredFileChanged = (path.indexOf("workspaceStorage") == -1) && (path.indexOf(".DS_Store") == -1) && (path.indexOf(this.en.FILE_LOCATIONSETTINGS_NAME) == -1) && (path.indexOf(this.en.APP_SUMMARY_NAME) == -1);

                console.log("Sync : File Change Detected On : " + path);

                if (requiredFileChanged) {
                    console.log("Sync : Initiating Auto-upload For File : " + path);
                    this.InitiateAutoUpload().then((resolve) => {
                        uploadStopped = resolve;
                    }, (reject) => {
                        uploadStopped = reject;
                    });

                } else {
                    uploadStopped = true;
                }
            }
            else {
                vscode.window.setStatusBarMessage("");
                vscode.window.setStatusBarMessage("Sync : Updating In Progres... Please Wait.", 3000);
            }
        });
    }

    public async InitiateAutoUpload(): Promise<boolean> {

        return new Promise<boolean>(async (resolve, reject) => {
            vscode.window.setStatusBarMessage("");
            vscode.window.setStatusBarMessage("Sync : Auto Upload Initiating.", 3000);

            setTimeout(function () {

                vscode.commands.executeCommand('extension.updateSettings', "forceUpdate").then((res) => {
                    resolve(true);
                });
            }, 3000);
        });


    }
    public CloseWatch(): void {
        if (Commons.configWatcher != null) {
            Commons.configWatcher.close();
        }
        if (Commons.extensionWatcher != null) {
            Commons.extensionWatcher.close();
        }

    }

    public async InitializeSettings(askInformation: boolean, askGIST: boolean): Promise<LocalSetting> {
        let config = vscode.workspace.getConfiguration('sync');
        let me: Commons = this;

        return new Promise<LocalSetting>(async (resolve, reject) => {

            let settings: LocalSetting = await me.GetSettings();

            if (askInformation) {
                if (settings.Token == null || settings.Token == "") {
                    openurl("https://github.com/settings/tokens");

                    await me.GetTokenAndSave(settings).then(function (token: string) {
                        if (!token) {
                            vscode.window.showErrorMessage("TOKEN NOT SAVED");
                            reject(false);
                        }
                        else {
                            settings.Token = token;
                        }
                    }, function (err: any) {
                        me.LogException(err, me.ERROR_MESSAGE, true);
                        reject(err);
                    });
                }

                if (askGIST) {
                    if (settings.Gist == null || settings.Gist === "") {
                        await me.GetGistAndSave(settings).then(function (Gist: string) {
                            if (Gist) {
                                settings.Gist = Gist;
                            }
                            else {
                                vscode.window.showErrorMessage("Sync : Gist Not Saved.");
                                reject(false);
                            }
                        }, function (err: any) {
                            me.LogException(err, me.ERROR_MESSAGE, true);
                            reject(err);
                        });
                    }
                }
            }
            resolve(settings);
        });
    }


    public StartMigrationProcess(): Promise<boolean> {
        let me: Commons = this;
        let settingKeys = Object.keys(new LocalSetting());
        return new Promise<boolean>(async (resolve, reject) => {
            await FileManager.FileExists(me.en.APP_SETTINGS).then(async function (fileExist: boolean) {

                if (fileExist) {
                    await FileManager.ReadFile(me.en.APP_SETTINGS).then(async function (settin: string) {

                        vscode.window.setStatusBarMessage("");
                        vscode.window.setStatusBarMessage("Sync : Migrating from Old Settings to Standard Settings File.", 2000);

                        if (settin) {
                            let oldsetting = JSON.parse(settin);
                            if (oldsetting.Token) {
                                let oldkeys = Object.keys(oldsetting);
                                oldkeys.forEach(oldKey => {
                                    if (settingKeys.indexOf(oldKey) == -1) {
                                        delete oldsetting[oldKey];
                                    }
                                });

                                await me.SaveSettings(oldsetting).then(async function (done) {
                                    vscode.window.showInformationMessage("Sync : Settings File Location Changed, Please read the release notes.");
                                });
                            }
                            await FileManager.DeleteFile(me.en.APP_SETTINGS);
                        }
                    });
                }
                else {
                    let settings: LocalSetting = await me.GetSettings();
                    if (settings.Version == 0 || settings.Version < Environment.CURRENT_VERSION) {
                        settings.Version = Environment.CURRENT_VERSION;
                        await me.SaveSettings(settings);
                    }

                }
                resolve(true);
            });
        });
    }


    public async SaveSettings(setting: any): Promise<boolean> {
        let me: Commons = this;
        let config = vscode.workspace.getConfiguration('sync');
        let allKeysUpdated = new Array<Thenable<void>>();

        return new Promise<any>((resolve, reject) => {

            let keys = Object.keys(setting);
            keys.forEach(async keyName => {

                if (setting[keyName] != null) {
                    console.log(keyName + ":" + typeof (setting[keyName]));
                    // if (keyName.toLowerCase() == "token") {
                    //     allKeysUpdated.push(me.context.globalState.update("token", setting[keyName]));
                    // }
                    // else {


                    switch (typeof (setting[keyName])) {
                        case "Date":
                            allKeysUpdated.push(config.update(keyName.toLowerCase(), setting[keyName].toString(), true));
                            break;
                        default:
                            allKeysUpdated.push(config.update(keyName.toLowerCase(), setting[keyName], true));
                            break;
                    }
                    //}
                }
            });

            Promise.all(allKeysUpdated).then(function (a) {
                resolve(true);
            }, function (b: any) {
                me.LogException(b, me.ERROR_MESSAGE, true);
                reject(b);
            });

        });

    }

    public GetSettings(): LocalSetting {
        var me = this;

        let settings = new LocalSetting();
        settings.Gist = vscode.workspace.getConfiguration("sync")["gist"];
        settings.lastUpload = new Date(vscode.workspace.getConfiguration("sync")["lastupload"]);
        settings.firstTime = vscode.workspace.getConfiguration("sync")["firsttime"];
        settings.autoDownload = vscode.workspace.getConfiguration("sync")["autodownload"];
        settings.autoUpload = vscode.workspace.getConfiguration("sync")["autoupload"];
        settings.allowUpload = vscode.workspace.getConfiguration("sync")["allowupload"];
        settings.lastDownload = new Date(vscode.workspace.getConfiguration("sync")["lastdownload"]);
        settings.Version = vscode.workspace.getConfiguration("sync")["version"];
        settings.showSummary = vscode.workspace.getConfiguration("sync")["showsummary"];
        settings.publicGist = vscode.workspace.getConfiguration("sync")["publicgist"];
        settings.forceDownload = vscode.workspace.getConfiguration("sync")["forcedownload"];
        settings.Token = vscode.workspace.getConfiguration("sync")["token"];
        // if (this.context.globalState.get('token')) {
        //     settings.Token = JSON.stringify(this.context.globalState.get('token'));
        // }

        return settings;
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

        console.log("Sync : " + "File Path For Summary Page : " + tempURI);

        //        var setting: vscode.Uri = vscode.Uri.parse("untitled:" + tempURI);

        var setting: vscode.Uri = vscode.Uri.file(tempURI);
        fs.openSync(setting.fsPath, 'w');

        //let a = vscode.window.activeTextEditor;

        vscode.workspace.openTextDocument(setting).then((a: vscode.TextDocument) => {
            vscode.window.showTextDocument(a, vscode.ViewColumn.One, true).then((e: vscode.TextEditor) => {

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
                //vscode.commands.executeCommand("workbench.action.openPreviousRecentlyUsedEditorInGroup");
            });
        }, (error: any) => {
            console.error(error);
            return;
        });

    };


}