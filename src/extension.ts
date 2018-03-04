'use strict';

import * as vscode from 'vscode';
import { PluginService, ExtensionInformation } from './service/pluginService';
import * as path from 'path';
import { Environment } from './environmentPath';
import { File, FileService } from './service/fileService';
import Commons from './commons';
import { GitHubService } from './service/githubService';
import { ExtensionConfig, LocalConfig, CloudSetting, CustomSettings, KeyValue } from './setting';
import { OsType, SettingType } from './enums';

export async function activate(context: vscode.ExtensionContext) {

    var fs = require('fs');
    const lockfile = require('proper-lockfile');

    var en: Environment = new Environment(context);
    var common: Commons = new Commons(en, context);

    let lockExist: boolean = await FileService.FileExists(en.FILE_SYNC_LOCK);
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

        if (gistAvailable == true && startUpSetting.autoDownload == true) {
            vscode.commands.executeCommand('extension.downloadSettings').then(suc => {
                if (startUpSetting.autoUpload && tokenAvailable && gistAvailable) {
                    common.StartWatch();
                }
            });
        }
        if (startUpSetting.autoUpload && tokenAvailable && gistAvailable) {
            common.StartWatch();
        }
    }

    var updateSettings = vscode.commands.registerCommand('extension.updateSettings', async function () {

        let args = arguments;
        let en: Environment = new Environment(context);
        let common: Commons = new Commons(en, context);
        let myGi: GitHubService = null;
        let localConfig: LocalConfig = new LocalConfig();
        let allSettingFiles = new Array<File>();
        let uploadedExtensions = new Array<ExtensionInformation>();
        let dateNow: Date = new Date();
        common.CloseWatch();
        let ignoreSettings = new Object();

        try {
            localConfig = await common.InitalizeSettings(true, false);
            localConfig.publicGist = false;
            if (args.length > 0) {
                if (args[0] == "publicGIST") {
                    localConfig.publicGist = true;
                }
            }

            myGi = new GitHubService(localConfig.customConfig.token);
            //ignoreSettings = await common.GetIgnoredSettings(localConfig.customConfig.ignoreUploadSettings);
            await startGitProcess(localConfig.extConfig, localConfig.customConfig);
            //await common.SetIgnoredSettings(ignoreSettings);

        } catch (error) {
            Commons.LogException(error, common.ERROR_MESSAGE, true);
            return;
        }

        async function startGitProcess(syncSetting: ExtensionConfig, customSettings: CustomSettings) {

            vscode.window.setStatusBarMessage("Sync : Uploading / Updating Your Settings In GitHub.", 2000);

            if (customSettings.downloadPublicGist) {
                if (customSettings.token == null || customSettings.token == "") {
                    vscode.window.showInformationMessage("Sync : Set GitHub Token or disable 'downloadPublicGist' from local Sync settings file.");;
                    return;
                }
            }

            syncSetting.lastUpload = dateNow;
            vscode.window.setStatusBarMessage("Sync : Reading Settings and Extensions.", 2000);



            // var remoteList = ExtensionInformation.fromJSONList(file.content);
            // var deletedList = PluginService.GetDeletedExtensions(uploadedExtensions);
            if (syncSetting.syncExtensions) {
                uploadedExtensions = PluginService.CreateExtensionList();

                uploadedExtensions.sort(function (a, b) {
                    return a.name.localeCompare(b.name);
                });
                let fileName = en.FILE_EXTENSION_NAME;
                let filePath = en.FILE_EXTENSION;
                let fileContent = JSON.stringify(uploadedExtensions, undefined, 2);
                let file: File = new File(fileName, fileContent, filePath, fileName);
                allSettingFiles.push(file);
            }


            let contentFiles: Array<File> = new Array();
            contentFiles = await FileService.ListFiles(en.USER_FOLDER, 0, 2, customSettings.supportedFileExtensions);

            let customExist: boolean = await FileService.FileExists(en.FILE_CUSTOMIZEDSETTINGS);
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
            var fileName: string = en.FILE_CLOUDSETTINGS_NAME;
            var fileContent: string = JSON.stringify(extProp);
            var file: File = new File(fileName, fileContent, "", fileName);
            allSettingFiles.push(file);

            let completed: boolean = false;
            let newGIST: boolean = false;

            if (syncSetting.gist == null || syncSetting.gist === "") {
                if (syncSetting.askGistName) {
                    customSettings.gistDescription = await common.AskGistName();
                }
                newGIST = true;
                await myGi.CreateEmptyGIST(localConfig.publicGist, customSettings.gistDescription).then(async function (gistID: string) {
                    if (gistID) {
                        syncSetting.gist = gistID;
                        vscode.window.setStatusBarMessage("Sync : New gist created.", 2000);
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
                        if (myGi.userName != null) {
                            let userName: string = myGi.userName.trim();
                            if (gistOwnerName != userName) {
                                Commons.LogException(null, "Sync : You cant edit GIST for user : " + gistObj.data.owner.login, true, function () {
                                    console.log("Sync : Current User : " + "'" + userName + "'");
                                    console.log("Sync : Gist Owner User : " + "'" + gistOwnerName + "'");
                                });
                                return;
                            }
                        }

                    }
                    if (gistObj.public == true) {
                        localConfig.publicGist = true;
                    }

                    vscode.window.setStatusBarMessage("Sync : Uploading Files Data.", 3000);
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

            if (completed) {
                await common.SaveSettings(syncSetting).then(function (added: boolean) {
                    if (added) {
                        if (newGIST) {
                            vscode.window.showInformationMessage("Sync : Upload Complete." + " GIST ID :  " + syncSetting.gist + " . Please copy and use this ID in other machines to download settings.");
                        }

                        if (localConfig.publicGist) {
                            vscode.window.showInformationMessage("Sync : Share the Id with other extension users to share the settings.");
                        }

                        if (!syncSetting.quietSync) {
                            common.ShowSummmaryOutput(true, allSettingFiles, null, uploadedExtensions, localConfig);
                            vscode.window.setStatusBarMessage("").dispose();
                        }
                        else {
                            vscode.window.setStatusBarMessage("").dispose();
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
        var myGi: GitHubService = null;
        var localSettings: LocalConfig = new LocalConfig();
        let ignoreSettings = new Object();
        common.CloseWatch();

        try {
            localSettings = await common.InitalizeSettings(true, true);
            //ignoreSettings = await common.GetIgnoredSettings(localSettings.customConfig.ignoreUploadSettings);
            await StartDownload(localSettings.extConfig, localSettings.customConfig);
            //await common.SetIgnoredSettings(ignoreSettings);

        } catch (error) {
            Commons.LogException(error, common.ERROR_MESSAGE, true);
            return;
        }

        async function StartDownload(syncSetting: ExtensionConfig, customSettings: CustomSettings) {

            myGi = new GitHubService(customSettings.token);
            vscode.window.setStatusBarMessage("").dispose();
            vscode.window.setStatusBarMessage("Sync : Reading Settings Online.", 2000);

            myGi.ReadGist(syncSetting.gist).then(async function (res: any) {

                var addedExtensions: Array<ExtensionInformation> = new Array<ExtensionInformation>();
                var deletedExtensions: Array<ExtensionInformation> = new Array<ExtensionInformation>();
                var updatedFiles: Array<File> = new Array<File>();
                var actionList = new Array<Promise<void | boolean>>();

                if (res) {
                    if (res.data.public == true) {
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
                                vscode.window.setStatusBarMessage("").dispose();
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
                                if (syncSetting.syncExtensions) {
                                    var extDelStatus: Array<KeyValue<string, boolean>> = new Array<KeyValue<string, boolean>>();
                                    if (syncSetting.removeExtensions) {
                                        try {
                                            deletedExtensions = await PluginService.DeleteExtensions(file.content, en.ExtensionFolder);
                                        }
                                        catch (uncompletedExtensions) {
                                            vscode.window.showErrorMessage("Sync : Unable to remove some extensions.");
                                            deletedExtensions = uncompletedExtensions;
                                        }

                                    }
                                    try {
                                        addedExtensions = await PluginService.InstallExtensions(file.content, en.ExtensionFolder, function (message: string, dispose: boolean) {
                                            //TODO:
                                            if (dispose) {
                                                vscode.window.setStatusBarMessage(message, 2000);
                                            }
                                            else {
                                                vscode.window.setStatusBarMessage(message, 5000);
                                            }
                                        });
                                    }
                                    catch (extensions) {
                                        addedExtensions = extensions;
                                    }
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
                                    let filePath: string = await FileService.CreateDirTree(en.USER_FOLDER, file.fileName);
                                    await actionList.push(FileService.WriteFile(filePath, content).then(
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
                                    common.ShowSummmaryOutput(false, updatedFiles, deletedExtensions, addedExtensions, localSettings);
                                    vscode.window.setStatusBarMessage("").dispose();
                                }
                                else {
                                    vscode.window.setStatusBarMessage("").dispose();
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
                let lockExist: boolean = await FileService.FileExists(en.FILE_SYNC_LOCK);

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
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('"http://shanalikhan.github.io/2015/12/15/Visual-Studio-Code-Sync-Settings.html'));
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
        items.push("Sync : Download Settings from Public GIST");
        items.push("Sync : Toggle Force Download");
        items.push("Sync : Toggle Auto-Upload On Settings Change");
        items.push("Sync : Toggle Auto-Download On Startup");
        items.push("Sync : Toggle Show Summary Page On Upload / Download");
        items.push("Sync : Preserve Setting To Stop Override After Download");
        items.push("Sync : Join Community");
        items.push("Sync : Open Issue");
        items.push("Sync : Release Notes");

        var selectedItem: Number = 0;
        var settingChanged: boolean = false;

        vscode.window.showQuickPick(items).then(async (resolve: string) => {

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
                    await vscode.window.showInformationMessage("Sync : This will remove current GIST and upload settings on new public GIST. Do you want to continue ?", "Yes").then(async (resolve) => {
                        if (resolve == "Yes") {
                            localSetting.publicGist = true;
                            settingChanged = true;
                            setting.gist = "";
                            selectedItem = 1;
                            customSettings.downloadPublicGist = false;
                            let done: boolean = await common.SetCustomSettings(customSettings);
                        }
                    }, (reject) => {
                        return;
                    });
                    break;
                }
                case items[2]: {
                    //Download Settings from Public GIST
                    selectedItem = 2;
                    customSettings.downloadPublicGist = true;
                    settingChanged = true;
                    let done: boolean = await common.SetCustomSettings(customSettings);
                    break;
                }
                case items[3]: {
                    //toggle force download
                    selectedItem = 3;
                    settingChanged = true;
                    if (setting.forceDownload) {
                        setting.forceDownload = false;
                    }
                    else {
                        setting.forceDownload = true;
                    }
                    break;
                }
                case items[4]: {
                    //toggle auto upload
                    selectedItem = 4;
                    settingChanged = true;
                    if (setting.autoUpload) {
                        setting.autoUpload = false;
                    }
                    else {
                        setting.autoUpload = true;
                    }
                    break;
                }
                case items[5]: {
                    //auto downlaod on startup
                    selectedItem = 5;
                    settingChanged = true;
                    if (!setting) {
                        vscode.commands.executeCommand('extension.HowSettings');
                        return;
                    }
                    if (!gistAvailable) {
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
                case items[6]: {
                    //page summary toggle
                    selectedItem = 6;
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

                case items[7]: {
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
                case items[8]: {
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk'));
                    break;
                }
                case items[9]: {
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://github.com/shanalikhan/code-settings-sync/issues/new'));
                    break;
                }
                case items[10]: {
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('http://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html'));
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
                            case 5: {
                                if (setting.autoDownload) {
                                    vscode.window.showInformationMessage("Sync : Auto Download turned ON upon VSCode Startup.");
                                }
                                else {
                                    vscode.window.showInformationMessage("Sync : Auto Download turned OFF upon VSCode Startup.");
                                }
                                break;
                            }
                            case 6: {
                                if (!setting.quietSync) {
                                    vscode.window.showInformationMessage("Sync : Summary will be shown upon download / upload.");
                                }
                                else {
                                    vscode.window.showInformationMessage("Sync : Status bar will be updated upon download / upload.");
                                }
                                break;
                            }
                            case 3: {
                                if (setting.forceDownload) {
                                    vscode.window.showInformationMessage("Sync : Force Download Turned On.");
                                }
                                else {
                                    vscode.window.showInformationMessage("Sync : Force Download Turned Off.");
                                }
                                break;
                            }
                            case 4: {
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
                            case 2: {
                                vscode.window.showInformationMessage("Sync : Settings Sync will not ask for GitHub Token from now on.");
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
