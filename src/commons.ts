"use strict";
import * as vscode from 'vscode';
import { Environment } from './environmentPath';
import { File, FileManager } from './fileManager';
import { ExtensionConfig, LocalConfig } from './setting';
import { PluginService, ExtensionInformation } from './pluginService';
import * as fs from 'fs';
import * as path from 'path';

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
        let self: Commons = this;

        Commons.extensionWatcher = chokidar.watch(this.en.ExtensionFolder, { depth: 0, ignoreInitial: true });
        Commons.configWatcher = chokidar.watch(this.en.PATH + "/User/", { depth: LocalConfig.DEPTH, ignoreInitial: true });

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
                let settings: ExtensionConfig = this.GetSettings();

                uploadStopped = false;
                let requiredFileChanged: boolean = false;

                if (settings.workspaceSync == true) {
                    requiredFileChanged = (path.indexOf(".DS_Store") == -1) && (path.indexOf(this.en.FILE_LOCATIONSETTINGS_NAME) == -1) && (path.indexOf(this.en.APP_SUMMARY_NAME) == -1);
                }
                else {
                    requiredFileChanged = (path.indexOf("workspaceStorage") == -1) && (path.indexOf(".DS_Store") == -1) && (path.indexOf(this.en.FILE_LOCATIONSETTINGS_NAME) == -1) && (path.indexOf(this.en.APP_SUMMARY_NAME) == -1);
                }

                console.log("Sync : File Change Detected On : " + path);

                if (requiredFileChanged) {

                    if (settings.autoUpload) {
                        if (settings.workspaceSync) {
                            let fileType: string = path.substring(path.lastIndexOf('.'), path.length);
                            if (fileType.indexOf('json') == -1) {
                                console.log("Sync : Cannot Initiate Auto-upload on This File (Not JSON).");
                                uploadStopped = true;
                                return;
                            }
                        }

                        console.log("Sync : Initiating Auto-upload For File : " + path);
                        this.InitiateAutoUpload(path).then((resolve) => {
                            uploadStopped = resolve;
                        }, (reject) => {
                            uploadStopped = reject;
                        });
                    }
                } else {
                    uploadStopped = true;
                }
            }
            else {
                vscode.window.setStatusBarMessage("");
                vscode.window.setStatusBarMessage("Sync : Updating In Progress... Please Wait.", 3000);
            }
        });
    }

    public async InitiateAutoUpload(path: string): Promise<boolean> {

        return new Promise<boolean>(async (resolve, reject) => {
            vscode.window.setStatusBarMessage("");
            vscode.window.setStatusBarMessage("Sync : Auto Upload Initiating.", 3000);

            setTimeout(function () {

                vscode.commands.executeCommand('extension.updateSettings', "forceUpdate", path).then((res) => {
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

    public async InitializeSettings(askInformation: boolean, askGIST: boolean): Promise<ExtensionConfig> {
        let config = vscode.workspace.getConfiguration('sync');
        let me: Commons = this;

        return new Promise<ExtensionConfig>(async (resolve, reject) => {

            let settings: ExtensionConfig = await me.GetSettings();

            if (askInformation) {
                if (settings.token == null || settings.token == "") {
                    openurl("https://github.com/settings/tokens");

                    await me.GetTokenAndSave(settings).then(function (token: string) {
                        if (!token) {
                            vscode.window.showErrorMessage("TOKEN NOT SAVED");
                            reject(false);
                        }
                        else {
                            settings.token = token;
                        }
                    }, function (err: any) {
                        me.LogException(err, me.ERROR_MESSAGE, true);
                        reject(err);
                    });
                }

                if (askGIST) {
                    if (settings.gist == null || settings.gist === "") {
                        await me.GetGistAndSave(settings).then(function (Gist: string) {
                            if (Gist) {
                                settings.gist = Gist;
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
        let settingKeys = Object.keys(new ExtensionConfig());
        return new Promise<boolean>(async (resolve, reject) => {

            let fileExist: boolean = await FileManager.FileExists(me.en.APP_SETTINGS);
            if (fileExist) {
                await FileManager.ReadFile(me.en.APP_SETTINGS).then(async function (settin: string) {

                    if (settin) {
                        let oldsetting = JSON.parse(settin);
                        if (oldsetting.Token) {

                            vscode.window.setStatusBarMessage("");
                            vscode.window.setStatusBarMessage("Sync : Migrating from Old Settings to Standard Settings File.", 2000);

                            let newSetting: ExtensionConfig = new ExtensionConfig();
                            newSetting.token = oldsetting.Token;
                            newSetting.gist = oldsetting.Gist;
                            //Storing only GIST and token after migration.

                            await me.SaveSettings(newSetting).then(async function (done) {
                                if (done) {
                                    vscode.window.showInformationMessage("Sync : Now this extension follows standard code configuration to setup this extension. Settings are migrated.");
                                    vscode.window.showInformationMessage("Sync : To Make it fully work you need to upload the settings once again. Uploading the Settings.");
                                    vscode.commands.executeCommand('extension.updateSettings');
                                    await FileManager.DeleteFile(me.en.APP_SETTINGS);
                                }
                            });
                        }
                    }
                });
            }
            else {
                let settings: ExtensionConfig = await me.GetSettings();
                if (settings.version == 0 || settings.version < Environment.CURRENT_VERSION) {
                    if (settings.version == 0) {
                        vscode.window.showInformationMessage("Sync : Settings Created");
                    }
                    settings.version = Environment.CURRENT_VERSION;
                    await me.SaveSettings(settings);
                }
            }
            resolve(true);
        });
    }


    public async SaveSettings(setting: ExtensionConfig): Promise<boolean> {
        let me: Commons = this;
        let config = vscode.workspace.getConfiguration('sync');
        let allKeysUpdated = new Array<Thenable<void>>();

        return new Promise<boolean>((resolve, reject) => {

            let keys = Object.keys(setting);
            keys.forEach(async keyName => {

                if (keyName == "lastDownload" || keyName == "lastUpload") {
                    try {
                        let zz = new Date(setting[keyName]);
                        setting[keyName] = zz;
                    } catch (e) {
                        setting[keyName] = new Date();
                    }
                }

                if (setting[keyName] == null) {
                    setting[keyName] = "";
                }

                if (keyName.toLowerCase() == "token") {
                    allKeysUpdated.push(me.context.globalState.update("synctoken", setting[keyName]));
                }
                else {
                    allKeysUpdated.push(config.update(keyName, setting[keyName], true));
                }
            });

            Promise.all(allKeysUpdated).then(function (a) {

                if (me.context.globalState.get('syncCounter')) {
                    let counter = me.context.globalState.get('syncCounter');
                    let count: number = parseInt(String(counter));
                    if (count % 100 == 0) {
                        vscode.window.showInformationMessage("Sync : Did you like this extension ? How about writing a review or send me some donation ;) ");
                    }
                    count = count + 1;
                    me.context.globalState.update("syncCounter", count)
                }
                else {
                    me.context.globalState.update("syncCounter", 1)
                }

                resolve(true);
            }, function (b: any) {
                me.LogException(b, me.ERROR_MESSAGE, true);
                reject(false);
            });
        });
    }

    public GetSettings(): ExtensionConfig {
        var me = this;

        let settings = new ExtensionConfig();
        let keys = Object.keys(settings);

        keys.forEach(key => {
            if (key != 'token') {
                settings[key] = vscode.workspace.getConfiguration("sync")[key];
            }
            else {
                if (this.context.globalState.get('synctoken')) {
                    let token = this.context.globalState.get('synctoken');
                    settings[key] = String(token);
                }
            }
        });
        return settings;
    }

    public async GetTokenAndSave(sett: ExtensionConfig): Promise<string> {
        var me = this;
        var opt = Commons.GetInputBox(true);
        return new Promise<string>((resolve, reject) => {
            (function getToken() {
                vscode.window.showInputBox(opt).then(async (token) => {
                    if (token && token.trim()) {
                        token = token.trim();

                        if (token != 'esc') {
                            sett.token = token;
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
                });
            } ());
        });
    }
    public async GetGistAndSave(sett: ExtensionConfig): Promise<string> {
        var me = this;
        var opt = Commons.GetInputBox(false);
        return new Promise<string>((resolve, reject) => {
            (function getGist() {
                vscode.window.showInputBox(opt).then(async (gist) => {
                    if (gist && gist.trim()) {
                        gist = gist.trim();
                        if (gist != 'esc') {
                            sett.gist = gist.trim();
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

    public GenerateSummmaryFile(upload: boolean, files: Array<File>, removedExtensions: Array<ExtensionInformation>, addedExtensions: Array<ExtensionInformation>, syncSettings: LocalConfig) {

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

        header = "\r\nFiles " + status + ".\r\n";

        var deletedExtension: string = "\r\nEXTENSIONS REMOVED :\r\n";
        var addedExtension: string = "\r\nEXTENSIONS ADDED :\r\n";
        var tempURI: string = this.en.APP_SUMMARY;

        console.log("Sync : " + "File Path For Summary Page : " + tempURI);

        var setting: vscode.Uri = vscode.Uri.file(tempURI);
        fs.openSync(setting.fsPath, 'w');

        vscode.workspace.openTextDocument(setting).then((a: vscode.TextDocument) => {
            vscode.window.showTextDocument(a, vscode.ViewColumn.One, true).then((e: vscode.TextEditor) => {

                e.edit(edit => {
                    edit.insert(new vscode.Position(0, 0), "VISUAL STUDIO CODE SETTINGS SYNC\r\n\r\n" + status + " SUMMARY\r\n\r\n");
                    edit.insert(new vscode.Position(1, 0), "--------------------\r\n");

                    edit.insert(new vscode.Position(2, 0), "GITHUB TOKEN: " + syncSettings.config.token + "\r\n");
                    edit.insert(new vscode.Position(3, 0), "GITHUB GIST: " + syncSettings.config.gist + "\r\n");
                    var type: string = (syncSettings.publicGist == true) ? "Public" : "Secret"
                    edit.insert(new vscode.Position(4, 0), "GITHUB GIST TYPE: " + type + "\r\n\r\n");
                    edit.insert(new vscode.Position(5, 0), "--------------------\r\n\r\n");

                    edit.insert(new vscode.Position(6, 0), header + "\r\n");
                    var row: number = 6;
                    for (var i = 0; i < files.length; i++) {
                        var element = files[i];
                        if (element.fileName.indexOf(".") > 0) {
                            edit.insert(new vscode.Position(row, 0), element.fileName + "\r\n");
                            row += 1;
                        }
                    }
                    if (removedExtensions) {
                        edit.insert(new vscode.Position(row, 0), deletedExtension + "\r\n");
                        row += 1;

                        if (removedExtensions.length > 0) {
                            removedExtensions.forEach(ext => {
                                edit.insert(new vscode.Position(row, 0), ext.name + " - Version :" + ext.version + "\r\n");
                                row += 1;
                            });
                        }
                        else {
                            edit.insert(new vscode.Position(row, 0), "No Extension needs to be removed.\r\n");
                        }
                    }

                    if (addedExtensions) {
                        row += 1;
                        edit.insert(new vscode.Position(row, 0), "\r\n" + addedExtension + "\r\n");
                        row += 1;
                        if (addedExtensions.length > 0) {
                            addedExtensions.forEach(ext => {
                                edit.insert(new vscode.Position(row, 0), ext.name + " - Version :" + ext.version + "\r\n");
                                row += 1;
                            });
                        }
                        else {
                            edit.insert(new vscode.Position(row, 0), "No Extension needs to install.\r\n");
                        }
                    }
                });
                e.document.save();
                //vscode.commands.executeCommand("workbench.action.nextEditorInGroup");
            });
        }, (error: any) => {
            console.error(error);
            return;
        });
    };
}