"use strict";
import * as vscode from 'vscode';
import { Environment } from './environmentPath';
import { File, FileService } from './service/fileService';
import { ExtensionConfig, LocalConfig, CustomSettings } from './setting';
import { PluginService, ExtensionInformation } from './service/pluginService';
import * as fs from 'fs';
import * as path from 'path';
import localize from './localize';

const chokidar = require('chokidar');
const lockfile = require('proper-lockfile');

export default class Commons {

    public ERROR_MESSAGE: string = localize("common.error.message");
    private static configWatcher = null;
    private static extensionWatcher = null;
    private static outputChannel: vscode.OutputChannel = null;

    constructor(private en: Environment, private context: vscode.ExtensionContext) {

    }

    public static LogException(error: any, message: string, msgBox: boolean, callback?: Function): void {

        if (error) {
            console.error(error);
            if (error.code == 500) {
                message = localize("common.error.connection");
                msgBox = false;
            }
            else if (error.code == 4) {
                message = localize("common.error.canNotSave");
            }
            else if (error.message) {
                try {
                    message = JSON.parse(error.message).message;
                    if (message.toLowerCase() == 'bad credentials') {
                        msgBox = true;
                        message = localize("common.error.invalidToken");
                        //vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://github.com/settings/tokens'));
                    }
                    if (message.toLowerCase() == 'not found') {
                        msgBox = true;
                        message = localize("common.error.invalidGistId")
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

        let lockExist: boolean = await FileService.FileExists(this.en.FILE_SYNC_LOCK);
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
                vscode.window.setStatusBarMessage(localize("common.info.updating"), 3000);
            }
        });
    }

    public async InitiateAutoUpload(path: string): Promise<boolean> {

        return new Promise<boolean>(async (resolve, reject) => {
            vscode.window.setStatusBarMessage("").dispose();
            vscode.window.setStatusBarMessage(localize("common.info.initAutoUpload"), 5000);

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
                    askToken = !cusSettings.downloadPublicGist;
                }

                if (askToken) {
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://github.com/settings/tokens'))
                    let tokTemp: string = await me.GetTokenAndSave(cusSettings);
                    if (!tokTemp) {
                        vscode.window.showErrorMessage(localize("common.error.tokenNotSave"));
                        reject(false);
                    }
                    cusSettings.token = tokTemp;
                }
            }


            if (extSettings.gist == "") {
                if (askGist) {
                    let gistTemp: string = await me.GetGistAndSave(extSettings);
                    if (!gistTemp) {
                        vscode.window.showErrorMessage(localize("common.error.gistNotSave"));
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
                let customExist: boolean = await FileService.FileExists(me.en.FILE_CUSTOMIZEDSETTINGS);
                if (customExist) {
                    let customSettingStr: string = await FileService.ReadFile(me.en.FILE_CUSTOMIZEDSETTINGS);
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
                vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('http://shanalikhan.github.io/2017/02/19/Option-to-ignore-settings-folders-code-settings-sync.html'));
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
                await FileService.WriteFile(me.en.FILE_CUSTOMIZEDSETTINGS, JSON.stringify(json));
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
            let fileExist: boolean = await FileService.FileExists(me.en.FILE_CUSTOMIZEDSETTINGS);
            let customSettings: CustomSettings = null;
            let firstTime: boolean = !fileExist;
            let fileChanged: boolean = firstTime;

            if (fileExist) {
                customSettings = await me.GetCustomSettings();
            }
            else {
                customSettings = new CustomSettings();
            }
            //vscode.workspace.getConfiguration().update("sync.version", undefined, true);

            if (firstTime) {
                const openExtensionPage = localize("common.action.openExtPage");
                const openExtensionTutorial = localize("common.action.openExtTutorial");
                vscode.window.showInformationMessage(localize("common.info.installed"));
                vscode.window.showInformationMessage(localize("common.info.needHelp"), openExtensionPage).then(function (val: string) {
                    if (val == openExtensionPage) {
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync'))
                    }
                });
                vscode.window.showInformationMessage(localize("common.info.excludeFile"), openExtensionTutorial).then(function (val: string) {
                    if (val == openExtensionTutorial) {
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('http://shanalikhan.github.io/2017/02/19/Option-to-ignore-settings-folders-code-settings-sync.html'))
                    }
                });
            }
            else if (customSettings.version < Environment.CURRENT_VERSION) {
                fileChanged = true;
                if (this.context.globalState.get('synctoken')) {
                    let token = this.context.globalState.get('synctoken');
                    if (token != "") {
                        customSettings.token = String(token);
                        this.context.globalState.update("synctoken", "");
                        vscode.window.showInformationMessage(localize("common.info.setToken"));
                    }
                }

                const releaseNotes = localize("common.action.releaseNotes");
                const writeReview = localize("common.action.writeReview");
                const support = localize("common.action.support");
                const joinCommunity = localize("common.action.joinCommunity");

                vscode.window.showInformationMessage(localize("common.info.updateTo", Environment.getVersion()), releaseNotes, writeReview, support, joinCommunity).then(function (val: string) {
                    if (val == releaseNotes) {
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('http://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html'));
                    }
                    if (val == writeReview) {
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync#review-details'));
                    }
                    if (val == support) {
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=4W3EWHHBSYMM8&lc=IE&item_name=Code%20Settings%20Sync&item_number=visual%20studio%20code%20settings%20sync&currency_code=USD&bn=PP-DonationsBF:btn_donate_SM.gif:NonHosted'));
                    }
                    if(val==joinCommunity){
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk'));
                    }
                });
            }
            if (fileChanged) {
                customSettings.version = Environment.CURRENT_VERSION;
                await me.SetCustomSettings(customSettings);
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
        const donateNow = localize("common.action.donate");
        const writeReview = localize("common.action.writeReview");
        vscode.window.showInformationMessage(localize("common.info.donate"), donateNow, writeReview).then((res) => {
            if (res == donateNow) {
                vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=4W3EWHHBSYMM8&lc=IE&item_name=Code%20Settings%20Sync&item_number=visual%20studio%20code%20settings%20sync&currency_code=USD&bn=PP-DonationsBF:btn_donate_SM.gif:NonHosted'));
            } else if (res == writeReview) {
                vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync#review-details'));
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
                                    vscode.window.setStatusBarMessage(localize("common.info.tokenSaved"), 1000);
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
                                    vscode.window.setStatusBarMessage(localize("common.info.gistSaved"), 1000);
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
                placeHolder: localize("common.placeholder.enterGithubAccessToken"),
                password: false,
                prompt: localize("common.prompt.enterGithubAccessToken"),
                ignoreFocusOut: true
            };
            return options;
        }
        else {
            let options: vscode.InputBoxOptions = {
                placeHolder: localize("common.placeholder.enterGistId"),
                password: false,
                prompt: localize("common.prompt.enterGistId"),
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
    public async AskGistName(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            vscode.window.showInputBox({
                prompt: localize("common.prompt.multipleGist")
                , ignoreFocusOut: true
                , placeHolder: localize("common.placeholder.multipleGist")
            }).then((value) => {
                resolve(value);
            });
        });

    }

    public ShowSummmaryOutput(upload: boolean, files: Array<File>, removedExtensions: Array<ExtensionInformation>, addedExtensions: Array<ExtensionInformation>, syncSettings: LocalConfig) {
        if (Commons.outputChannel === null) {
            Commons.outputChannel = vscode.window.createOutputChannel("Code Settings Sync");
        }

        const outputChannel = Commons.outputChannel;
        outputChannel.clear();
        outputChannel.appendLine(`CODE SETTINGS SYNC ${upload ? "UPLOAD" : "DOWNLOAD"} SUMMARY`);
        outputChannel.appendLine(`Version: ${Environment.getVersion()}`);
        outputChannel.appendLine(`--------------------`);
        outputChannel.appendLine(`GitHub Token: ${syncSettings.customConfig.token || "Anonymous"}`);
        outputChannel.appendLine(`GitHub Gist: ${syncSettings.extConfig.gist}`);
        outputChannel.appendLine(`GitHub Gist Type: ${syncSettings.publicGist ? "Public" : "Secret"}`);
        outputChannel.appendLine(``);
        if (!syncSettings.customConfig.token) {
            outputChannel.appendLine(`Anonymous Gist cannot be edited, the extension will always create a new one during upload.`);
        }
        outputChannel.appendLine(`Restarting Visual Studio Code may be required to apply color and file icon theme.`);
        outputChannel.appendLine(`--------------------`);

        outputChannel.appendLine(`Files ${upload ? "Upload" : "Download"}ed:`);
        files
            .filter(item => item.fileName.indexOf(".") > 0)
            .forEach(item => {
                if (item.fileName != item.gistName) {
                    if (upload) {
                        outputChannel.appendLine(`  ${item.fileName} > ${item.gistName}`);
                    }
                    else {
                        outputChannel.appendLine(`  ${item.gistName} > ${item.fileName}`);
                    }
                }
            });

        outputChannel.appendLine(``);
        outputChannel.appendLine(`  Extensions Removed:`);

        if (!syncSettings.extConfig.removeExtensions) {
            outputChannel.appendLine(' Feature Disabled.');
        }
        else {
            if (removedExtensions) {
                if (removedExtensions.length === 0) {
                    outputChannel.appendLine("  No extensions removed.");
                }
                else {

                    removedExtensions.forEach(extn => {
                        outputChannel.appendLine(`  ${extn.name} v${extn.version}`);
                    });
                }
            }
        }

        if (addedExtensions) {
            outputChannel.appendLine(``)
            outputChannel.appendLine(`Extensions Added:`)

            if (addedExtensions.length === 0) {
                outputChannel.appendLine("  No extensions installed.");
            }

            addedExtensions.forEach(extn => {
                outputChannel.appendLine(`  ${extn.name} v${extn.version}`);
            });
        }

        outputChannel.appendLine(`--------------------`);
        outputChannel.append(`Done.`)
        outputChannel.show(true)
    };
}
