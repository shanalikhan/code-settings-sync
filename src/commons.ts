"use strict";
import * as vscode from 'vscode';
import { Environment } from './environmentPath';
import { File, FileManager } from './fileManager';
import { ExtensionConfig, LocalConfig, CustomSettings } from './setting';
import { PluginService, ExtensionInformation } from './pluginService';
import * as fs from 'fs';
import * as path from 'path';

const openurl = require('opn');
const chokidar = require('chokidar');
const lockfile = require('proper-lockfile');

export class Commons {

    public ERROR_MESSAGE: string = "Sync : Error Logged In Console (Help menu > Toggle Developer Tools).";
    private static configWatcher = null;
    private static extensionWatcher = null;

    constructor(private en: Environment, private context: vscode.ExtensionContext) {

    }

    public static LogException(error: any, message: string, msgBox: boolean, callback?: Function): void {

        if (error) {
            console.error(error);
            if (error.code == 500) {
                message = "Sync : Internet Not Connected or Unable to Connect to GitHub. Exception Logged in Console";
                msgBox = false;
            }
            else if (error.code == 4) {
                message = "Sync : Unable to Save Settings. Please make sure you have valid JSON settings.json file. ( e.g : No trailing commas )";
            }
            else if (error.message) {
                try {
                    message = JSON.parse(error.message).message;
                    if (message.toLowerCase() == 'bad credentials') {
                        msgBox = true;
                        message = "Sync : Invalid / Expired GitHub Token. Please generate new token with scopes mentioned in readme. Exception Logged in Console.";
                        openurl("https://github.com/settings/tokens");
                    }
                } catch (error) {
                    //message = error.message;
                }
            }
        }

        if (msgBox == true) {
            vscode.window.showErrorMessage(message);
            vscode.window.setStatusBarMessage("").dispose();
        }
        else {
            vscode.window.setStatusBarMessage(message, 5000);
        }

        if (callback) {
            callback.apply(this);
        }
    }

    public async StartWatch(): Promise<void> {

        let lockExist: boolean = await FileManager.FileExists(this.en.FILE_SYNC_LOCK);
        if (!lockExist) {
            fs.closeSync(fs.openSync(this.en.FILE_SYNC_LOCK, 'w'));
        }

        let self: Commons = this;
        let locked: boolean = lockfile.checkSync(this.en.FILE_SYNC_LOCK);
        if (locked) {
            lockfile.unlockSync(this.en.FILE_SYNC_LOCK);
        }
        let uploadStopped: boolean = true;
        Commons.extensionWatcher = chokidar.watch(this.en.ExtensionFolder, { depth: 0, ignoreInitial: true });
        Commons.configWatcher = chokidar.watch(this.en.PATH + "/User/", { depth: 2, ignoreInitial: true });

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

        Commons.configWatcher.on('change', async (path: string) => {
            let locked: boolean = lockfile.checkSync(this.en.FILE_SYNC_LOCK);
            if (locked) {
                uploadStopped = false;
            }

            if (uploadStopped) {
                uploadStopped = false;
                lockfile.lockSync(self.en.FILE_SYNC_LOCK);
                let settings: ExtensionConfig = this.GetSettings();
                let customSettings: CustomSettings = await this.GetCustomSettings();
                if (customSettings == null) {
                    return;
                }

                let requiredFileChanged: boolean = false;
                if (customSettings.ignoreUploadFolders.indexOf("workspaceStorage") == -1) {
                    requiredFileChanged = (path.indexOf(self.en.FILE_SYNC_LOCK_NAME) == -1) && (path.indexOf(".DS_Store") == -1) && (path.indexOf(this.en.APP_SUMMARY_NAME) == -1) && (path.indexOf(this.en.FILE_CUSTOMIZEDSETTINGS_NAME) == -1);
                }
                else {
                    requiredFileChanged = (path.indexOf(self.en.FILE_SYNC_LOCK_NAME) == -1) && (path.indexOf("workspaceStorage") == -1) && (path.indexOf(".DS_Store") == -1) && (path.indexOf(this.en.APP_SUMMARY_NAME) == -1) && (path.indexOf(this.en.FILE_CUSTOMIZEDSETTINGS_NAME) == -1);
                }

                console.log("Sync : File Change Detected On : " + path);

                if (requiredFileChanged) {
                    if (settings.autoUpload) {
                        if (customSettings.ignoreUploadFolders.indexOf("workspaceStorage") > -1) {
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
                            lockfile.unlockSync(self.en.FILE_SYNC_LOCK);
                        }, (reject) => {
                            lockfile.unlockSync(self.en.FILE_SYNC_LOCK);
                            uploadStopped = true;
                        });
                    }
                } else {
                    uploadStopped = true;
                    lockfile.unlockSync(self.en.FILE_SYNC_LOCK);
                }
            }
            else {
                vscode.window.setStatusBarMessage("").dispose();
                vscode.window.setStatusBarMessage("Sync : Updating In Progress ... Please Wait.", 3000);
            }
        });
    }

    public async InitiateAutoUpload(path: string): Promise<boolean> {

        return new Promise<boolean>(async (resolve, reject) => {
            vscode.window.setStatusBarMessage("").dispose();
            vscode.window.setStatusBarMessage("Sync : Auto Upload Initiating In 5 Seconds.", 5000);

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

    public async InitalizeSettings(askToken: boolean, askGist: boolean): Promise<LocalConfig> {
        let me: Commons = this;
        return new Promise<LocalConfig>(async (resolve, reject) => {
            var settings: LocalConfig = new LocalConfig();
            var extSettings: ExtensionConfig = me.GetSettings()
            var cusSettings: CustomSettings = await me.GetCustomSettings();

            if (cusSettings.token == "") {
                if (askToken == true) {
                    askToken = !extSettings.anonymousGist;
                }

                if (askToken) {
                    openurl("https://github.com/settings/tokens");
                    let tokTemp: string = await me.GetTokenAndSave(cusSettings);
                    if (!tokTemp) {
                        vscode.window.showErrorMessage("Sync : Token Not Saved.");
                        reject(false);
                    }
                    cusSettings.token = tokTemp;
                }
            }


            if (extSettings.gist == "") {
                if (askGist) {
                    let gistTemp: string = await me.GetGistAndSave(extSettings);
                    if (!gistTemp) {
                        vscode.window.showErrorMessage("Sync : Gist Not Saved.");
                        reject(false);
                    }
                    extSettings.gist = gistTemp;
                }
            }
            settings.customConfig = cusSettings;
            settings.extConfig = extSettings;
            resolve(settings);
        });
    }

    public async GetCustomSettings(): Promise<CustomSettings> {
        let me: Commons = this;
        return new Promise<CustomSettings>(async (resolve, reject) => {

            let customSettings: CustomSettings = new CustomSettings();
            try {
                let customExist: boolean = await FileManager.FileExists(me.en.FILE_CUSTOMIZEDSETTINGS);
                if (customExist) {
                    let customSettingStr: string = await FileManager.ReadFile(me.en.FILE_CUSTOMIZEDSETTINGS);
                    let tempObj: Object = JSON.parse(customSettingStr);
                    if (!Array.isArray(tempObj["ignoreUploadSettings"])) {
                        tempObj["ignoreUploadSettings"] = new Array<string>();
                    }
                    Object.assign(customSettings, tempObj);
                    customSettings.token = customSettings.token.trim();
                    resolve(customSettings);
                }
            }
            catch (e) {
                Commons.LogException(e, "Sync : Unable to read " + this.en.FILE_CUSTOMIZEDSETTINGS_NAME + ". Make sure its Valid JSON.", true);
                openurl("http://shanalikhan.github.io/2017/02/19/Option-to-ignore-settings-folders-code-settings-sync.html");
                customSettings = null;
                resolve(customSettings);
            }
        });
    }

    public async SetCustomSettings(setting: CustomSettings): Promise<boolean> {
        let me: Commons = this;
        return new Promise<boolean>(async (resolve, reject) => {
            try {
                let json: Object = Object.assign(setting);
                delete json["ignoreUploadSettings"]
                await FileManager.WriteFile(me.en.FILE_CUSTOMIZEDSETTINGS, JSON.stringify(json));
                resolve(true);
            }
            catch (e) {
                Commons.LogException(e, "Sync : Unable to write " + this.en.FILE_CUSTOMIZEDSETTINGS_NAME, true);
                resolve(false);
            }
        });
    }

    public StartMigrationProcess(): Promise<boolean> {
        let me: Commons = this;
        let settingKeys = Object.keys(new ExtensionConfig());
        return new Promise<boolean>(async (resolve, reject) => {

            let settings: ExtensionConfig = await me.GetSettings();
            let fileExist: boolean = await FileManager.FileExists(me.en.FILE_CUSTOMIZEDSETTINGS);
            let customSettings: CustomSettings = null;
            let firstTime: boolean = true;

            if (fileExist) {
                customSettings = await me.GetCustomSettings();
                firstTime = false;
            }
            else {
                firstTime = true;
                customSettings = new CustomSettings();
            }
            vscode.workspace.getConfiguration().update("sync.version", undefined, true);

            if (firstTime) {
                vscode.window.showInformationMessage("Sync : Settings Created. Thank You for Installing !");
                vscode.window.showInformationMessage("Sync : Need Help regarding configuring this extension ?", "Open Extension Page").then(function (val: string) {
                    if (val == "Open Extension Page") {
                        openurl("https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync");
                    }
                });
                vscode.window.showInformationMessage("Sync : You can exclude any file / folder for upload and settings for download.", "Open Tutorial").then(function (val: string) {
                    if (val == "Open Tutorial") {
                        openurl("http://shanalikhan.github.io/2017/02/19/Option-to-ignore-settings-folders-code-settings-sync.html");
                    }
                });
            }
            else if (customSettings.version == 0 || customSettings.version < Environment.CURRENT_VERSION) {

                if (this.context.globalState.get('synctoken')) {
                    let token = this.context.globalState.get('synctoken');
                    if (token != "") {
                        customSettings.token = String(token);
                        this.context.globalState.update("synctoken", "");
                        vscode.window.showInformationMessage("Sync : Now You can set your GitHub token manually in `syncLocalSettings.json`");
                    }
                }
                  vscode.window.showInformationMessage("Sync : Updated v"+ Environment.getVersion(),"Release Notes","Write Review","Donate Now").then(function(val: string){
                    if(val == "Release Notes"){
                        openurl("http://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html");
                    }
                    if(val=="Write Review"){
                        openurl("https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync#review-details");
                    }
                    if(val=="Donate Now"){
                        openurl("https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=4W3EWHHBSYMM8&lc=IE&item_name=Code%20Settings%20Sync&item_number=visual%20studio%20code%20settings%20sync&currency_code=USD&bn=PP-DonationsBF:btn_donate_SM.gif:NonHosted");
                    }
                });
            }
            customSettings.version = Environment.CURRENT_VERSION;
            let done: boolean = await me.SetCustomSettings(customSettings);
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
                if ((keyName == "lastDownload" || keyName == "lastUpload") && setting[keyName]) {
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
                    if (count % 450 == 0) {
                        me.DonateMessage();
                    }
                    count = count + 1;
                    me.context.globalState.update("syncCounter", count)
                }
                else {
                    me.context.globalState.update("syncCounter", 1)
                }
                resolve(true);
            }, function (b: any) {
                Commons.LogException(b, me.ERROR_MESSAGE, true);
                reject(false);
            });
        });
    }

    public DonateMessage(): void {
        vscode.window.showInformationMessage("Sync : Do you like this extension ? How about writing a review or send me some donation ;) ", "Donate Now", "Write Review").then((res) => {
            if (res == "Donate Now") {
                openurl("https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=4W3EWHHBSYMM8&lc=IE&item_name=Code%20Settings%20Sync&item_number=visual%20studio%20code%20settings%20sync&currency_code=USD&bn=PP-DonationsBF:btn_donate_SM.gif:NonHosted");
            } else if (res == "Write Review") {
                openurl("https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync#review-details");
            }
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
        });
        settings.gist = settings.gist.trim();
        return settings;
    }

    public async GetTokenAndSave(sett: CustomSettings): Promise<string> {
        var me = this;
        var opt = Commons.GetInputBox(true);
        return new Promise<string>((resolve, reject) => {
            (function getToken() {
                vscode.window.showInputBox(opt).then(async (token) => {
                    if (token && token.trim()) {
                        token = token.trim();
                        if (token != 'esc') {
                            sett.token = token;
                            await me.SetCustomSettings(sett).then(function (saved: boolean) {
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
            }());
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
                placeHolder: "Enter GitHub Personal Access Token",
                password: false,
                prompt: "Link opened to get the GitHub token. Enter token and press [Enter] or press / type 'esc' to cancel.",
                ignoreFocusOut: true
            };
            return options;
        }
        else {
            let options: vscode.InputBoxOptions = {
                placeHolder: "Enter Gist Id",
                password: false,
                prompt: "Enter Gist Id from previously uploaded settings and press [Enter] or press / type 'esc' to cancel.",
                ignoreFocusOut: true
            };
            return options;
        }
    };


    /**
     * IgnoreSettings
     */
    public async GetIgnoredSettings(settings: Array<String>): Promise<Object> {
        let ignoreSettings: Object = new Object();
        return new Promise<Object>((resolve, reject) => {
            let config = vscode.workspace.getConfiguration();
            let keysUpdated = new Array<Thenable<void>>();
            settings.forEach(async (key: string, index: number) => {
                let keyValue: Object = null;
                keyValue = config.get<null>(key, null);
                if (keyValue != null) {
                    ignoreSettings[key] = keyValue;
                    keysUpdated.push(config.update(key, undefined, true));
                }
            });
            Promise.all(keysUpdated).then((a => {
                resolve(ignoreSettings);
            }), (rej) => {
                rej(null);
            });
        });

    }


    /**
     * RestoreIgnoredSettings
     */
    public SetIgnoredSettings(ignoredSettings: Object): void {
        let config = vscode.workspace.getConfiguration();
        let keysUpdated = new Array<Thenable<void>>();
        Object.keys(ignoredSettings).forEach(async (key: string, index: number) => {
            keysUpdated.push(config.update(key, ignoredSettings[key], true));
        });
    }

    /**
     * AskGistName
     */
    public async AskGistName() : Promise<string> {
        return new Promise<string>((resolve, reject) => {
            vscode.window.showInputBox({
                prompt: "Allows you to identify the settings if you have multiple gist. For example : Office Settings, Home Personal Dev Settings."
                , ignoreFocusOut: true
                , placeHolder: "Visual Studio Code Settings Sync Gist"
            }).then((value) => {
                resolve(value);
            });
        });

    }

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
                    edit.insert(new vscode.Position(0, 0), "VISUAL STUDIO CODE SETTINGS SYNC \r\nVersion: " + Environment.getVersion() + "\r\n\r\n" + status + " Summary\r\n\r\n");
                    edit.insert(new vscode.Position(1, 0), "--------------------\r\n");
                    let tokenPlaceHolder: string = "Anonymous";
                    if (syncSettings.customConfig.token != "") {
                        tokenPlaceHolder = syncSettings.customConfig.token;
                    }

                    edit.insert(new vscode.Position(2, 0), "GITHUB TOKEN: " + tokenPlaceHolder + "\r\n");
                    edit.insert(new vscode.Position(3, 0), "GITHUB GIST: " + syncSettings.extConfig.gist + "\r\n");
                    var type: string = (syncSettings.publicGist == true) ? "Public" : "Secret"
                    edit.insert(new vscode.Position(4, 0), "GITHUB GIST TYPE: " + type + "\r\n\r\n");
                    edit.insert(new vscode.Position(5, 0), "--------------------\r\n\r\n");
                    if (syncSettings.customConfig.token == "") {
                        edit.insert(new vscode.Position(5, 0), "Anonymous Gist Cant be edited, extension will always create new one during upload.\r\n\r\n");
                    }

                    edit.insert(new vscode.Position(5, 0), "If current theme / file icon extension is not installed. Restart will be Required to Apply Theme and File Icon.\r\n\r\n");

                    edit.insert(new vscode.Position(6, 0), header + "\r\n");
                    var row: number = 6;
                    for (var i = 0; i < files.length; i++) {
                        var element = files[i];
                        if (element.fileName.indexOf(".") > 0) {
                            let fileName = element.fileName;
                            if (fileName != element.gistName) {
                                if (upload) {
                                    fileName += " > " + element.gistName;
                                } else {
                                    fileName = element.gistName + " > " + fileName;
                                }
                            }
                            edit.insert(new vscode.Position(row, 0), fileName + "\r\n");
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
