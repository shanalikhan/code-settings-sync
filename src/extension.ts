'use strict';

import * as vscode from 'vscode';
import { PluginService, ExtensionInformation } from './pluginService';
import * as path from 'path';
import { Environment } from './environmentPath';
import { File, FileManager } from './fileManager';
import { Commons } from './commons';
import { GithubService } from './githubService';
import { ExtensionConfig, LocalConfig, CloudSetting, CustomSettings } from './setting';
import { OsType, SettingType } from './enums';

export async function activate(context: vscode.ExtensionContext) {

    var openurl = require('opn');
    var fs = require('fs');
    const lockfile = require('proper-lockfile');

    var en: Environment = new Environment(context);
    var common: Commons = new Commons(en, context);

    let lockExist: boolean = await FileManager.FileExists(en.FILE_SYNC_LOCK);
    if (!lockExist) {
        fs.closeSync(fs.openSync(en.FILE_SYNC_LOCK, 'w'));
    }

    let locked: boolean = lockfile.checkSync(en.FILE_SYNC_LOCK);
    if (locked) {
        lockfile.unlockSync(en.FILE_SYNC_LOCK);
    }

    await common.StartMigrationProcess();
    let startUpSetting: ExtensionConfig = await common.GetSettings();
    let startUpCustomSetting: CustomSettings = await common.GetCustomSettings();

    if (startUpSetting) {
        let tokenAvailable: boolean = (startUpCustomSetting.token != null) && (startUpCustomSetting.token != "");
        let gistAvailable: boolean = (startUpSetting.gist != null) && (startUpSetting.gist != "");

        if (startUpSetting.autoUpload && tokenAvailable && gistAvailable) {
            common.StartWatch();
        }
        if (gistAvailable == true && startUpSetting.autoDownload == true) {
            vscode.commands.executeCommand('extension.downloadSettings');
        }
    }

    var updateSettings = vscode.commands.registerCommand('extension.updateSettings', async function () {

        let args = arguments;
        let en: Environment = new Environment(context);
        let common: Commons = new Commons(en, context);
        let myGi: GithubService = null;
        let localConfig: LocalConfig = new LocalConfig();
        let allSettingFiles = new Array<File>();
        let uploadedExtensions = new Array<ExtensionInformation>();
        let dateNow: Date = new Date();
        common.CloseWatch();

        try {
            localConfig = await common.InitalizeSettings(true, false);
            let config = vscode.workspace.getConfiguration();

            let keysUpdated = new Array<Thenable<void>>();
            Object.keys(localConfig.customConfig.ignoreUploadSettings).forEach(async (key: string, index: number) => {
                let keyValue: Object = null;
                keyValue = config.get<null>(key, null);
                if (keyValue != null) {
                    localConfig.customConfig.ignoreUploadSettings[key] = keyValue;
                    keysUpdated.push(config.update(key, keyValue, true));
                    keysUpdated.push(config.update(key, undefined, true));
                }
            });

            //let a: Object = await Promise.all(keysUpdated);
            Promise.all(keysUpdated).then(async (res) => {
                await common.SetCustomSettings(localConfig.customConfig);
                localConfig.publicGist = false;
                if (args.length > 0) {
                    if (args[0] == "publicGIST") {
                        localConfig.publicGist = true;
                    }
                }
                myGi = new GithubService(localConfig.customConfig.token);
                await startGitProcess(localConfig.extConfig, localConfig.customConfig);
            }, (er) => {
                Commons.LogException(er, common.ERROR_MESSAGE, true);
                return;
            });
        } catch (error) {
            Commons.LogException(error, common.ERROR_MESSAGE, true);
            return;
        }

        async function startGitProcess(syncSetting: ExtensionConfig, customSettings: CustomSettings) {

            vscode.window.setStatusBarMessage("Sync : Uploading / Updating Your Settings In Github.");

            if (!syncSetting.anonymousGist) {
                if (customSettings.token == null && customSettings.token == "") {
                    vscode.window.showInformationMessage("Sync : Set Github Token or set anonymousGist to true from settings.");
                    return;
                }
            }

            syncSetting.lastUpload = dateNow;
            vscode.window.setStatusBarMessage("Sync : Reading Settings and Extensions.");

            uploadedExtensions = PluginService.CreateExtensionList();

            uploadedExtensions.sort(function (a, b) {
                return a.name.localeCompare(b.name);
            });

            // var remoteList = ExtensionInformation.fromJSONList(file.content);
            // var deletedList = PluginService.GetDeletedExtensions(uploadedExtensions);

            let fileName = en.FILE_EXTENSION_NAME;
            let filePath = en.FILE_EXTENSION;
            let fileContent = JSON.stringify(uploadedExtensions, undefined, 2);;
            let file: File = new File(fileName, fileContent, filePath, fileName);
            allSettingFiles.push(file);

            let contentFiles: Array<File> = new Array();
            contentFiles = await FileManager.ListFiles(en.USER_FOLDER, 0, 2);

            let customExist: boolean = await FileManager.FileExists(en.FILE_CUSTOMIZEDSETTINGS);
            if (customExist) {
                customSettings = await common.GetCustomSettings();
                contentFiles = contentFiles.filter((file: File, index: number) => {
                    let a: boolean = file.fileName != en.FILE_CUSTOMIZEDSETTINGS_NAME;
                    return a;
                });

                if (customSettings.ignoreUploadFiles.length > 0) {
                    contentFiles = contentFiles.filter((file: File, index: number) => {
                        let a: boolean = customSettings.ignoreUploadFiles.indexOf(file.fileName) == -1 && file.fileName != en.FILE_CUSTOMIZEDSETTINGS_NAME;
                        return a;
                    });
                }
                if (customSettings.ignoreUploadFolders.length > 0) {
                    contentFiles = contentFiles.filter((file: File, index: number) => {
                        let matchedFolders = customSettings.ignoreUploadFolders.filter((folder) => {
                            return file.filePath.indexOf(folder) == -1;
                        });
                        return matchedFolders.length > 0;
                    });
                }
            }
            else {
                Commons.LogException(null, common.ERROR_MESSAGE, true);
                return;
            }

            contentFiles.forEach(snippetFile => {
                if (snippetFile.fileName != en.APP_SUMMARY_NAME && snippetFile.fileName != en.FILE_KEYBINDING_MAC) {
                    if (snippetFile.content != "") {
                        if (snippetFile.fileName == en.FILE_KEYBINDING_NAME) {
                            var destinationKeyBinding: string = "";
                            if (en.OsType == OsType.Mac) {
                                destinationKeyBinding = en.FILE_KEYBINDING_MAC;
                            }
                            else {
                                destinationKeyBinding = en.FILE_KEYBINDING_DEFAULT;
                            }
                            snippetFile.gistName = destinationKeyBinding;
                        }
                        allSettingFiles.push(snippetFile);
                    }
                }
            });

            var extProp: CloudSetting = new CloudSetting();
            extProp.lastUpload = dateNow;
            fileName = en.FILE_CLOUDSETTINGS_NAME;
            fileContent = JSON.stringify(extProp);
            file = new File(fileName, fileContent, "", fileName);
            allSettingFiles.push(file);

            let completed: boolean = false;
            let newGIST: boolean = false;

            if (syncSetting.anonymousGist) {
                await myGi.CreateAnonymousGist(localConfig.publicGist, allSettingFiles, customSettings.gistDescription).then(async function (gistID: string) {
                    if (gistID) {
                        newGIST = true;
                        syncSetting.gist = gistID;
                        completed = true;
                        vscode.window.setStatusBarMessage("Sync : New gist created.");
                    }
                    else {
                        vscode.window.showInformationMessage("Sync : Unable to create Gist.");
                        return;
                    }
                }, function (error: any) {
                    Commons.LogException(error, common.ERROR_MESSAGE, true);
                    return;
                });
            }
            else {
                if (syncSetting.gist == null || syncSetting.gist === "") {
                    newGIST = true;
                    await myGi.CreateEmptyGIST(localConfig.publicGist, customSettings.gistDescription).then(async function (gistID: string) {
                        if (gistID) {
                            syncSetting.gist = gistID;
                            vscode.window.setStatusBarMessage("Sync : New gist created.");
                        }
                        else {
                            vscode.window.showInformationMessage("Sync : Unable to create Gist.");
                            return;
                        }
                    }, function (error: any) {
                        Commons.LogException(error, common.ERROR_MESSAGE, true);
                        return;
                    });
                }

                await myGi.ReadGist(syncSetting.gist).then(async function (gistObj: any) {

                    if (gistObj) {
                        if (gistObj.data.owner != null) {
                            let gistOwnerName: string = gistObj.data.owner.login.trim();
                            let userName: string = myGi.userName.trim();
                            if (gistOwnerName != userName) {
                                Commons.LogException(null, "Sync : You cant edit GIST for user : " + gistObj.data.owner.login, true, function () {
                                    console.log("Sync : Current User : " + "'" + userName + "'");
                                    console.log("Sync : Gist Owner User : " + "'" + gistOwnerName + "'");
                                });
                                return;
                            }
                        }
                        if (gistObj.public == true) {
                            localConfig.publicGist = true;
                        }

                        vscode.window.setStatusBarMessage("Sync : Uploading Files Data.");
                        gistObj = myGi.UpdateGIST(gistObj, allSettingFiles);

                        await myGi.SaveGIST(gistObj.data).then(async function (saved: boolean) {
                            if (saved) {
                                completed = true;
                            }
                            else {
                                vscode.window.showErrorMessage("GIST NOT SAVED");
                                return;
                            }
                        }, function (error: any) {
                            Commons.LogException(error, common.ERROR_MESSAGE, true);
                            return;
                        });
                    }
                    else {
                        vscode.window.showErrorMessage("GIST ID: " + syncSetting.gist + " UNABLE TO READ.");
                        return;
                    }
                }, function (gistReadError: any) {
                    Commons.LogException(gistReadError, common.ERROR_MESSAGE, true);
                    return;
                });
            }

            if (completed) {
                await common.SaveSettings(syncSetting).then(function (added: boolean) {
                    let config = vscode.workspace.getConfiguration();
                    Object.keys(customSettings.ignoreUploadSettings).forEach((key: string, index: number) => {
                        config.update(key, customSettings.ignoreUploadSettings[key], true);
                    });
                    if (added) {
                        if (newGIST) {
                            vscode.window.showInformationMessage("Sync : Upload Complete." + " GIST ID :  " + syncSetting.gist + " . Please copy and use this ID in other machines to download settings.");
                        }

                        if (localConfig.publicGist) {
                            vscode.window.showInformationMessage("Sync : Share the Id with other extension users to share the settings.");
                        }

                        if (!syncSetting.quietSync) {
                            common.GenerateSummmaryFile(true, allSettingFiles, null, uploadedExtensions, localConfig);
                            vscode.window.setStatusBarMessage("");
                        }
                        else {
                            vscode.window.setStatusBarMessage("");
                            vscode.window.setStatusBarMessage("Sync : Uploaded Successfully.", 5000);
                        }
                        if (syncSetting.autoUpload) {
                            common.StartWatch();
                        }
                    }
                }, function (err: any) {
                    Commons.LogException(err, common.ERROR_MESSAGE, true);
                    return;
                });
            }
        }
    });

    var downloadSettings = vscode.commands.registerCommand('extension.downloadSettings', async function () {

        var en: Environment = new Environment(context);
        var common: Commons = new Commons(en, context);
        var myGi: GithubService = null;
        var localSettings: LocalConfig = new LocalConfig();
        common.CloseWatch();

        try {
            localSettings = await common.InitalizeSettings(false, true);
            await StartDownload(localSettings.extConfig, localSettings.customConfig);

        } catch (error) {
            Commons.LogException(error, common.ERROR_MESSAGE, true);
            return;
        }

        async function StartDownload(syncSetting: ExtensionConfig, customSettings: CustomSettings) {

            myGi = new GithubService(customSettings.token);
            vscode.window.setStatusBarMessage("");
            vscode.window.setStatusBarMessage("Sync : Reading Settings Online.", 2000);

            myGi.ReadGist(syncSetting.gist).then(async function (res: any) {

                var addedExtensions: Array<ExtensionInformation> = new Array<ExtensionInformation>();
                var deletedExtensions: Array<ExtensionInformation> = new Array<ExtensionInformation>();
                var updatedFiles: Array<File> = new Array<File>();
                var actionList = new Array<Promise<void | boolean>>();

                if (res) {
                    if (res.public == true) {
                        localSettings.publicGist = true;
                    }
                    var keys = Object.keys(res.data.files);
                    if (keys.indexOf(en.FILE_CLOUDSETTINGS_NAME) > -1) {
                        var cloudSettGist: Object = JSON.parse(res.data.files[en.FILE_CLOUDSETTINGS_NAME].content);
                        var cloudSett: CloudSetting = Object.assign(new CloudSetting(), cloudSettGist);;

                        let lastUploadStr: string = (syncSetting.lastUpload) ? syncSetting.lastUpload.toString() : "";
                        let lastDownloadStr: string = (syncSetting.lastDownload) ? syncSetting.lastDownload.toString() : "";

                        var upToDate: boolean = false;
                        if (lastDownloadStr != "") {
                            upToDate = new Date(lastDownloadStr).getTime() === new Date(cloudSett.lastUpload).getTime();
                        }

                        if (lastUploadStr != "") {
                            upToDate = upToDate || new Date(lastUploadStr).getTime() === new Date(cloudSett.lastUpload).getTime();
                        }

                        if (!syncSetting.forceDownload) {
                            if (upToDate) {
                                vscode.window.setStatusBarMessage("");
                                vscode.window.setStatusBarMessage("Sync : You already have latest version of saved settings.", 5000);
                                return;
                            }
                        }
                        syncSetting.lastDownload = cloudSett.lastUpload;
                    }

                    keys.forEach(gistName => {
                        if (res.data.files[gistName]) {
                            if (res.data.files[gistName].content) {
                                if (gistName.indexOf(".") > -1) {
                                    if (en.OsType == OsType.Mac && gistName == en.FILE_KEYBINDING_DEFAULT) {
                                        return;
                                    }
                                    if (en.OsType != OsType.Mac && gistName == en.FILE_KEYBINDING_MAC) {
                                        return;
                                    }
                                    var f: File = new File(gistName, res.data.files[gistName].content, null, gistName);
                                    updatedFiles.push(f);
                                }
                            }
                        }
                        else {
                            console.log(gistName + " key in response is empty.");
                        }
                    });

                    for (var index = 0; index < updatedFiles.length; index++) {

                        var file: File = updatedFiles[index];
                        var path: string = null;
                        var writeFile: boolean = false;
                        var content: string = file.content;

                        if (content != "") {
                            if (file.gistName == en.FILE_EXTENSION_NAME) {
                                var extensionlist = PluginService.CreateExtensionList();

                                extensionlist.sort(function (a, b) {
                                    return a.name.localeCompare(b.name);
                                });

                                var remoteList = ExtensionInformation.fromJSONList(file.content);
                                var deletedList = PluginService.GetDeletedExtensions(remoteList);

                                for (var deletedItemIndex = 0; deletedItemIndex < deletedList.length; deletedItemIndex++) {
                                    var deletedExtension = deletedList[deletedItemIndex];
                                    (async function (deletedExtension: ExtensionInformation, ExtensionFolder: string) {
                                        await actionList.push(PluginService.DeleteExtension(deletedExtension, en.ExtensionFolder)
                                            .then((res) => {
                                                //vscode.window.showInformationMessage(deletedExtension.name + '-' + deletedExtension.version + " is removed.");
                                                deletedExtensions.push(deletedExtension);
                                            }, (rej) => {
                                                Commons.LogException(rej, common.ERROR_MESSAGE, true);
                                            }));
                                    }(deletedExtension, en.ExtensionFolder));

                                }

                                var missingList = PluginService.GetMissingExtensions(remoteList);
                                if (missingList.length == 0) {
                                    vscode.window.setStatusBarMessage("");
                                    vscode.window.setStatusBarMessage("Sync : No Extension needs to be installed.", 2000);
                                }
                                else {

                                    vscode.window.setStatusBarMessage("Sync : Installing Extensions in background.");
                                    missingList.forEach(async (element) => {

                                        await actionList.push(PluginService.InstallExtension(element, en.ExtensionFolder)
                                            .then(function () {
                                                addedExtensions.push(element);
                                                //var name = element.publisher + '.' + element.name + '-' + element.version;
                                                //vscode.window.showInformationMessage("Extension " + name + " installed Successfully");
                                            }));
                                    });
                                }
                            }
                            else {

                                writeFile = true;
                                if (file.gistName == en.FILE_KEYBINDING_DEFAULT || file.gistName == en.FILE_KEYBINDING_MAC) {
                                    let test: string = "";
                                    en.OsType == OsType.Mac ? test = en.FILE_KEYBINDING_MAC : test = en.FILE_KEYBINDING_DEFAULT;
                                    if (file.gistName != test) {
                                        writeFile = false;
                                    }
                                }
                                if (writeFile) {
                                    if (file.gistName == en.FILE_KEYBINDING_MAC) {
                                        file.fileName = en.FILE_KEYBINDING_DEFAULT;
                                    }
                                    let filePath: string = await FileManager.CreateDirTree(en.USER_FOLDER, file.fileName);
                                    await actionList.push(FileManager.WriteFile(filePath, content).then(
                                        function (added: boolean) {
                                            //TODO : add Name attribute in File and show information message here with name , when required.
                                        }, function (error: any) {
                                            Commons.LogException(error, common.ERROR_MESSAGE, true);
                                            return;
                                        }
                                    ));
                                }
                            }
                        }
                    }
                }
                else {
                    Commons.LogException(res, "Sync : Unable to Read Gist.", true);
                }

                Promise.all(actionList)
                    .then(async function () {

                        // if (!syncSetting.showSummary) {
                        //     if (missingList.length == 0) {
                        //         //vscode.window.showInformationMessage("No extension need to be installed");
                        //     }
                        //     else {
                        //         //extension message when summary is turned off
                        //         vscode.window.showInformationMessage("Sync : " + missingList.length + " extensions installed Successfully, Restart Required.");
                        //     }
                        //     if (deletedExtensions.length > 0) {
                        //         vscode.window.showInformationMessage("Sync : " + deletedExtensions.length + " extensions deleted Successfully, Restart Required.");
                        //     }
                        // }

                        await common.SaveSettings(syncSetting).then(async function (added: boolean) {
                            if (added) {
                                if (!syncSetting.quietSync) {
                                    common.GenerateSummmaryFile(false, updatedFiles, deletedExtensions, addedExtensions, localSettings);
                                    vscode.window.setStatusBarMessage("");
                                }
                                else {
                                    vscode.window.setStatusBarMessage("");
                                    vscode.window.setStatusBarMessage("Sync : Download Complete.", 5000);
                                }
                                if (Object.keys(customSettings.replaceCodeSettings).length > 0) {

                                    let config = vscode.workspace.getConfiguration();
                                    let keysDefined: Array<string> = Object.keys(customSettings.replaceCodeSettings);
                                    keysDefined.forEach((key: string, index: number) => {
                                        let c: string = undefined;
                                        let value: string = customSettings.replaceCodeSettings[key];
                                        value == "" ? c == undefined : c = value;
                                        config.update(key, c, true);
                                    });
                                }
                                if (syncSetting.autoUpload) {
                                    common.StartWatch();
                                }
                            }
                            else {
                                vscode.window.showErrorMessage("Sync : Unable to save extension settings file.")
                            }
                        }, function (errSave: any) {
                            Commons.LogException(errSave, common.ERROR_MESSAGE, true);
                            return;
                        });
                    })
                    .catch(function (e) {
                        Commons.LogException(e, common.ERROR_MESSAGE, true);
                    });
            }, function (err: any) {
                Commons.LogException(err, common.ERROR_MESSAGE, true);
                return;
            });
        }
    });

    var resetSettings = vscode.commands.registerCommand('extension.resetSettings', async () => {

        var extSettings: ExtensionConfig = null;
        var localSettings: CustomSettings = null;
        await Init();

        async function Init() {
            vscode.window.setStatusBarMessage("Sync : Resetting Your Settings.", 2000);

            try {
                var en: Environment = new Environment(context);
                var common: Commons = new Commons(en, context);

                extSettings = new ExtensionConfig();
                localSettings = new CustomSettings();

                let extSaved: boolean = await common.SaveSettings(extSettings);
                let customSaved: boolean = await common.SetCustomSettings(localSettings);
                let lockExist: boolean = await FileManager.FileExists(en.FILE_SYNC_LOCK);

                if (!lockExist) {
                    fs.closeSync(fs.openSync(en.FILE_SYNC_LOCK, 'w'));
                }

                let locked: boolean = lockfile.checkSync(en.FILE_SYNC_LOCK);
                if (locked) {
                    lockfile.unlockSync(en.FILE_SYNC_LOCK);
                }

                if (extSaved && customSaved) {
                    vscode.window.showInformationMessage("Sync : Settings Cleared.");
                }
            }
            catch (err) {
                Commons.LogException(err, "Sync : Unable to clear settings. Error Logged on console. Please open an issue.", true);
            }
        }
    });

    var howSettings = vscode.commands.registerCommand('extension.HowSettings', async () => {
        openurl("http://shanalikhan.github.io/2015/12/15/Visual-Studio-Code-Sync-Settings.html");
    });

    var otherOptions = vscode.commands.registerCommand('extension.otherOptions', async () => {
        var en: Environment = new Environment(context);
        var common: Commons = new Commons(en, context);
        var setting: ExtensionConfig = await common.GetSettings();
        let customSettings: CustomSettings = await common.GetCustomSettings();
        var localSetting: LocalConfig = new LocalConfig();
        var tokenAvailable: boolean = customSettings.token != null && customSettings.token != "";
        var gistAvailable: boolean = setting.gist != null && setting.gist != "";

        let items: Array<string> = new Array<string>();
        items.push("Sync : Edit Extension Local Settings");
        items.push("Sync : Share Settings with Public GIST");
        items.push("Sync : Toggle Force Download");
        items.push("Sync : Toggle Auto-Upload On Settings Change");
        items.push("Sync : Toggle Auto-Download On Startup");
        items.push("Sync : Toggle Show Summary Page On Upload / Download");
        items.push("Sync : Preserve Setting to stop overide after Download");
        items.push("Sync : Open Issue");
        items.push("Sync : Release Notes");

        var selectedItem: Number = 0;
        var settingChanged: boolean = false;

        var teims = vscode.window.showQuickPick(items).then(async (resolve: string) => {

            switch (resolve) {
                case items[0]: {
                    //extension local settings
                    var file: vscode.Uri = vscode.Uri.file(en.FILE_CUSTOMIZEDSETTINGS);
                    fs.openSync(file.fsPath, 'r');
                    await vscode.workspace.openTextDocument(file).then((a: vscode.TextDocument) => {
                        vscode.window.showTextDocument(a, vscode.ViewColumn.One, true);
                    });
                    break;
                }
                case items[1]: {
                    //share public gist
                    await vscode.window.showInformationMessage("Sync : This will remove current GIST and upload settings on new public GIST. Do you want to continue ?", "Yes").then((resolve) => {
                        if (resolve == "Yes") {
                            localSetting.publicGist = true;
                            settingChanged = true;
                            setting.gist = "";
                            selectedItem = 1;
                        }
                    }, (reject) => {
                        return;
                    });
                    break;
                }
                case items[2]: {
                    //toggle force download
                    selectedItem = 2;
                    settingChanged = true;
                    if (setting.forceDownload) {
                        setting.forceDownload = false;
                    }
                    else {
                        setting.forceDownload = true;
                    }
                    break;
                }
                case items[3]: {
                    //toggle auto upload
                    selectedItem = 3;
                    settingChanged = true;
                    if (setting.autoUpload) {
                        setting.autoUpload = false;
                    }
                    else {
                        setting.autoUpload = true;
                    }
                    break;
                }
                case items[4]: {
                    //auto downlaod on startup
                    selectedItem = 4;
                    settingChanged = true;
                    if (!setting) {
                        vscode.commands.executeCommand('extension.HowSettings');
                        return;
                    }
                    if (!tokenAvailable || !gistAvailable) {
                        vscode.commands.executeCommand('extension.HowSettings');
                        return;
                    }
                    if (setting.autoDownload) {
                        setting.autoDownload = false;
                    }
                    else {
                        setting.autoDownload = true;
                    }
                    break;
                }
                case items[5]: {
                    //page summary toggle
                    selectedItem = 5;
                    settingChanged = true;

                    if (!tokenAvailable || !gistAvailable) {
                        vscode.commands.executeCommand('extension.HowSettings');
                        return;
                    }
                    if (setting.quietSync) {
                        setting.quietSync = false;
                    }
                    else {
                        setting.quietSync = true;
                    }
                    break;
                }

                case items[6]: {
                    //preserve
                    let options: vscode.InputBoxOptions = {
                        ignoreFocusOut: true,
                        placeHolder: "Enter any Key from settings.json to preserve.",
                        prompt: "Example : Write 'http.proxy' => store this computer proxy and overwrite it , if set empty it will remove proxy."

                    };
                    vscode.window.showInputBox(options).then(async (res) => {
                        if (res) {
                            let settingKey: string = res;
                            let a = vscode.workspace.getConfiguration();
                            let val: string = a.get<string>(settingKey);
                            customSettings.replaceCodeSettings[res] = val;
                            let done: boolean = await common.SetCustomSettings(customSettings);
                            if (done) {
                                if (val == "") {
                                    vscode.window.showInformationMessage("Sync : Done. " + res + " value will be removed from settings.json after downloading.");
                                }
                                else {
                                    vscode.window.showInformationMessage("Sync : Done. Extension will keep " + res + " : " + val + " in setting.json after downloading.");
                                }
                            }
                        }
                    });
                    break;
                }
                case items[7]: {
                    openurl("https://github.com/shanalikhan/code-settings-sync/issues/new");
                    break;
                }
                case items[8]: {
                    openurl("http://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html");
                    break;
                }
                default: {
                    break;
                }
            }
        }, (reject) => {
            Commons.LogException(reject, "Error", true);
            return;
        }).then(async (resolve: any) => {
            if (settingChanged) {
                if (selectedItem == 1) {
                    common.CloseWatch();
                }
                await common.SaveSettings(setting).then(async function (added: boolean) {
                    if (added) {
                        switch (selectedItem) {
                            case 4: {
                                if (setting.autoDownload) {
                                    vscode.window.showInformationMessage("Sync : Auto Download turned ON upon VSCode Startup.");
                                }
                                else {
                                    vscode.window.showInformationMessage("Sync : Auto Download turned OFF upon VSCode Startup.");
                                }
                                break;
                            }
                            case 5: {
                                if (!setting.quietSync) {
                                    vscode.window.showInformationMessage("Sync : Summary will be shown upon download / upload.");
                                }
                                else {
                                    vscode.window.showInformationMessage("Sync : Status bar will be updated upon download / upload.");
                                }
                                break;
                            }
                            case 2: {
                                if (setting.forceDownload) {
                                    vscode.window.showInformationMessage("Sync : Force Download Turned On.");
                                }
                                else {
                                    vscode.window.showInformationMessage("Sync : Force Download Turned Off.");
                                }
                                break;
                            }
                            case 3: {
                                if (setting.autoUpload) {
                                    vscode.window.showInformationMessage("Sync : Auto upload on Setting Change Turned On. Will be affected after restart.");
                                }
                                else {
                                    vscode.window.showInformationMessage("Sync : Auto upload on Setting Change Turned Off.");
                                }
                                break;
                            }
                            case 1: {
                                await vscode.commands.executeCommand('extension.updateSettings', "publicGIST");
                                break;
                            }
                        }
                    }
                    else {
                        vscode.window.showErrorMessage("Unable to Toggle.");
                    }
                }, function (err: any) {
                    Commons.LogException(err, "Sync : Unable to toggle. Please open an issue.", true);
                    return;
                });
            }
        }, (reject: any) => {
            Commons.LogException(reject, "Error", true);
            return;
        });
    });

    context.subscriptions.push(updateSettings);
    context.subscriptions.push(downloadSettings);
    context.subscriptions.push(resetSettings);
    context.subscriptions.push(howSettings);
    context.subscriptions.push(otherOptions);

}
