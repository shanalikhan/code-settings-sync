import * as vscode from 'vscode';
import {PluginService, ExtensionInformation} from './pluginService';
import * as path from 'path';
import {Environment} from './environmentPath';
import {File, FileManager} from './fileManager';
import * as commons from './commons';
import {GithubService} from './githubService';
import {LocalSetting, CloudSetting, OldSetting} from './setting';
import {OsType, SettingType} from './enums';

export async function activate(context: vscode.ExtensionContext) {


    var openurl = require('open');
    var fs = require('fs');
    var watch = require('node-watch');
    var GitHubApi = null;
    var github = null;

    var mainSyncSetting: any = null;
    var newSetting: LocalSetting = new LocalSetting();
    var settingChanged: boolean = false;
    var emptySetting: boolean = false;
    var en: Environment = new Environment(context);
    var common: commons.Commons = new commons.Commons(en);
    var watcherThroughUpdate= false;

    // check InternetConnected

    var status = await common.InternetConnected();
    if (status) {
        GitHubApi = require("github");
        github = new GitHubApi({
            version: "3.0.0"
        });
    } else {
        vscode.window.setStatusBarMessage("Sync : Internet Not Connected.", 3000);
    }

    //migration code starts

    await common.InitSettings().then(async (resolve: any) => {

        if (resolve) {
            mainSyncSetting = resolve;
            if (!mainSyncSetting.Version || mainSyncSetting.Version < Environment.CURRENT_VERSION) {
                settingChanged = true;
                newSetting.Version = Environment.CURRENT_VERSION;

                if (mainSyncSetting.Token) {
                    newSetting.Token = mainSyncSetting.Token;
                    if (mainSyncSetting.Gist) {
                        newSetting.Gist = mainSyncSetting.Gist;
                    }
                    if (mainSyncSetting.showSummary) {
                        newSetting.showSummary = mainSyncSetting.showSummary;
                    }
                    if (mainSyncSetting.lastDownload) {
                        newSetting.lastDownload = mainSyncSetting.lastDownload;
                    }
                    if (mainSyncSetting.lastUpload) {
                        newSetting.lastUpload = mainSyncSetting.lastUpload;
                    }
                    if (mainSyncSetting.allowUpload) {
                        newSetting.allowUpload = mainSyncSetting.allowUpload;
                    }
                    if (mainSyncSetting.publicGist) {
                        newSetting.publicGist = mainSyncSetting.publicGist;
                    }
                }
            }
            else {
                newSetting = mainSyncSetting;
                var tokenAvailable = newSetting.Token != null && newSetting.Token != "";
                var gistAvailable = newSetting.Gist != null && newSetting.Gist != "";

                if (tokenAvailable && gistAvailable && newSetting.autoDownload) {
                    if (status) {
                        vscode.commands.executeCommand('extension.downloadSettings');
                    }
                }
            }
        }
        else {
            settingChanged = true;
            emptySetting = true;
        }

        if (settingChanged) {
            await common.SaveSettings(newSetting).then(async function (added: boolean) {
                if (added) {
                    if (!emptySetting) {
                        vscode.window.showInformationMessage("Sync : Migration to new version complete. Read Release Notes for details.");
                    }
                    else {
                        vscode.window.showInformationMessage("Sync : Settings Created.");
                    }
                }
                else {
                    vscode.window.showErrorMessage("GIST and Token couldn't be migrated to new version. You need to add them again.")
                }
            });
        }

    }, (reject) => {
        common.LogException(reject, common.ERROR_MESSAGE);
    });

    //migration code ends
    var tokenAvailable = newSetting.Token != null && newSetting.Token != "";
    var gistAvailable = newSetting.Gist != null && newSetting.Gist != "";

    var appSetting = en.APP_SETTINGS;
    var appSummary = en.APP_SUMMARY;
    while (appSetting.indexOf("/") > -1) {
        appSetting = appSetting.replace("/", "\\");
    }

    while (appSummary.indexOf("/") > -1) {
        appSummary = appSummary.replace("/", "\\");
    }


    if (newSetting.uploadOnChange && tokenAvailable && gistAvailable) {
        var watcher = watch(en.PATH + "/User/");

        watcher.on('change',(path) => {
            
            if ((path != appSetting) && (path != appSummary)) {
                if (status && !watcherThroughUpdate) {
                    
                    vscode.window.setStatusBarMessage("Updating Process Started On File Change.");
                    vscode.commands.executeCommand('extension.updateSettings',"start");
                    //return;
                }

            }
            //console.log(event, path);
        });
    }

    var updateSettings = vscode.commands.registerCommand('extension.updateSettings', async () => {

        let args = arguments;
        
        debugger;
        var en: Environment = new Environment(context);
        var common: commons.Commons = new commons.Commons(en);

        var status = await common.InternetConnected();

        if (status) {
            GitHubApi = require("github");
            github = new GitHubApi({
                version: "3.0.0"
            });
        }
        else {
            vscode.window.showInformationMessage("Sync :Internet Not Connected.");
            return;
        }

        var myGi: GithubService = null;
        var dateNow: Date = new Date();
        var syncSetting: LocalSetting = new LocalSetting();
        var allSettingFiles = new Array<File>();
        var uploadedExtensions = new Array<ExtensionInformation>();

        await common.InitSettings().then(async (resolve) => {
            syncSetting = resolve;
            await Init();
        }, (reject) => {
            common.LogException(reject, common.ERROR_MESSAGE);
            return;
        });

        async function Init() {

            if (syncSetting.Token == null || syncSetting.Token == "") {
                openurl("https://github.com/settings/tokens");
                await common.GetTokenAndSave(syncSetting).then(function (token: string) {
                    if (token) {
                        syncSetting.Token = token;
                    }
                    else {
                        vscode.window.showErrorMessage("TOKEN NOT SAVED");
                        return;
                    }
                }, function (err: any) {
                    common.LogException(err, common.ERROR_MESSAGE);
                    return;
                });
            }
            myGi = new GithubService(syncSetting.Token);
            vscode.window.setStatusBarMessage("Sync : Uploading / Updating Your Settings In Github.");
            await startGitProcess();
        }


        async function startGitProcess() {
            if (!syncSetting.allowUpload) {
                vscode.window.setStatusBarMessage("Sync : Upload to Other User GIST Not Allowed. Reset Settings Required!");
                return;
            }

            if (syncSetting.Token != null && syncSetting.Token != "") {
                syncSetting.lastUpload = dateNow;

                vscode.window.setStatusBarMessage("Sync : Reading Settings and Extensions.");

                var settingFile: File = await FileManager.GetFile(en.FILE_SETTING, en.FILE_SETTING_NAME);
                var launchFile: File = await FileManager.GetFile(en.FILE_LAUNCH, en.FILE_LAUNCH_NAME);

                var destinationKeyBinding: string = "";
                if (en.OsType == OsType.Mac) {
                    destinationKeyBinding = en.FILE_KEYBINDING_MAC;
                }
                else {
                    destinationKeyBinding = en.FILE_KEYBINDING_DEFAULT;
                }

                var keybindingFile: File = await FileManager.GetFile(en.FILE_KEYBINDING, destinationKeyBinding);
                var localeFile: File = await FileManager.GetFile(en.FILE_LOCALE, en.FILE_LOCALE_NAME);

                if (settingFile) {
                    allSettingFiles.push(settingFile);
                }
                if (launchFile) {
                    allSettingFiles.push(launchFile);
                }
                if (keybindingFile) {
                    allSettingFiles.push(keybindingFile);
                }
                if (localeFile) {
                    allSettingFiles.push(localeFile);
                }

                uploadedExtensions = PluginService.CreateExtensionList();

                uploadedExtensions.sort(function (a, b) {
                    return a.name.localeCompare(b.name);
                });

                var fileName = en.FILE_EXTENSION_NAME;
                var filePath = en.FILE_EXTENSION;
                var fileContent = JSON.stringify(uploadedExtensions, undefined, 2);;
                var file: File = new File(fileName, fileContent, filePath);
                allSettingFiles.push(file);

                var snippetFiles = await FileManager.ListFiles(en.FOLDER_SNIPPETS);
                snippetFiles.forEach(snippetFile => {
                    allSettingFiles.push(snippetFile);
                });

                var extProp: CloudSetting = new CloudSetting();
                extProp.lastUpload = dateNow;
                fileName = en.FILE_CLOUDSETTINGS_NAME;
                fileContent = JSON.stringify(extProp);
                file = new File(fileName, fileContent, "");
                allSettingFiles.push(file);

                var newGIST = false;
                if (syncSetting.Gist == null || syncSetting.Gist === "") {
                    newGIST = true;
                    await myGi.CreateEmptyGIST(syncSetting.publicGist).then(async function (gistID: string) {
                        if (gistID) {
                            syncSetting.Gist = gistID;
                            vscode.window.setStatusBarMessage("Sync : Empty GIST ID: " + syncSetting.Gist + " created To insert files, in Process...");
                        }
                        else {
                            vscode.window.showInformationMessage("GIST UNABLE TO CREATE");
                            return;
                        }
                    }, function (error: any) {
                        common.LogException(error, common.ERROR_MESSAGE);
                        return;
                    });
                }

                await myGi.ReadGist(syncSetting.Gist).then(async function (gistObj: any) {

                    if (gistObj) {
                        vscode.window.setStatusBarMessage("Sync : Uploading Files Data.");
                        gistObj = myGi.UpdateGIST(gistObj, allSettingFiles);

                        await myGi.SaveGIST(gistObj).then(async function (saved: boolean) {
                            if (saved) {
                                await common.SaveSettings(syncSetting).then(function (added: boolean) {
                                    if (added) {
                                        if (newGIST) {
                                            vscode.window.showInformationMessage("Uploaded Successfully." + " GIST ID :  " + syncSetting.Gist + " . Please copy and use this ID in other machines to sync all settings.");
                                        }
                                        else {
                                            vscode.window.setStatusBarMessage("");
                                            vscode.window.setStatusBarMessage("Uploaded Successfully.", 5000);
                                        }
                                        if (syncSetting.showSummary) {
                                            common.GenerateSummmaryFile(true, allSettingFiles, null, uploadedExtensions, syncSetting);
                                        }


                                        vscode.window.setStatusBarMessage("");
                                    }
                                }, function (err: any) {
                                    common.LogException(err, common.ERROR_MESSAGE);
                                    return;
                                });

                            }
                            else {
                                vscode.window.showErrorMessage("GIST NOT SAVED");
                                return;
                            }
                        }, function (error: any) {
                            common.LogException(error, common.ERROR_MESSAGE);
                            return;
                        });
                    }
                    else {
                        vscode.window.showErrorMessage("GIST ID: " + syncSetting.Gist + " UNABLE TO READ.");
                        return;
                    }

                }, function (gistReadError: any) {
                    common.LogException(gistReadError, common.ERROR_MESSAGE);
                    return;
                });
            }
            else {
                vscode.window.showErrorMessage("ERROR ! Github Account Token Not Set");
            }
        }

    });


    var downloadSettings = vscode.commands.registerCommand('extension.downloadSettings', async () => {

        watcherThroughUpdate = true;

        var en: Environment = new Environment(context);
        var common: commons.Commons = new commons.Commons(en);

        var status = await common.InternetConnected();

        if (status) {
            GitHubApi = require("github");
            github = new GitHubApi({
                version: "3.0.0"
            });
        }
        else {
            vscode.window.showInformationMessage("Sync : Internet Not Connected.");
            return;
        }


        var myGi: GithubService = null;
        var syncSetting: LocalSetting = new LocalSetting();

        await common.InitSettings().then(async (resolve) => {
            syncSetting = resolve;
            await Init();
        }, (reject) => {
            common.LogException(reject, common.ERROR_MESSAGE);

        });

        async function Init() {
            var actionPromises: Array<Promise<void>> = new Array<Promise<void>>();

            if (syncSetting.Token == null || syncSetting.Token == "") {
                openurl("https://github.com/settings/tokens");
                await common.GetTokenAndSave(syncSetting).then(function (token: string) {
                    if (!token) {
                        vscode.window.showErrorMessage("TOKEN NOT SAVED");
                        return;
                    }
                    else {
                        syncSetting.Token = token;
                    }
                }, function (err: any) {
                    common.LogException(err, common.ERROR_MESSAGE);
                    return;
                });
            }

            if (syncSetting.Gist == null || syncSetting.Gist === "") {
                await common.GetGistAndSave(syncSetting).then(function (Gist: string) {
                    if (Gist) {
                        syncSetting.Gist = Gist;
                    }
                    else {
                        vscode.window.showErrorMessage("GIST NOT SAVED");
                        return;
                    }
                }, function (err: any) {
                    common.LogException(err, common.ERROR_MESSAGE);
                    return;
                });
            }
            // Promise.all(actionPromises).then(async (resol) => {
            await StartDownload();
            // }, (reject) => {
            //     common.LogException(reject, common.ERROR_MESSAGE);
            //     return;
            // });

        }

        async function StartDownload() {

            myGi = new GithubService(syncSetting.Token);
            vscode.window.setStatusBarMessage("");
            vscode.window.setStatusBarMessage("Sync : Reading Settings Online.", 2000);

            myGi.ReadGist(syncSetting.Gist).then(async function (res: any) {
                var addedExtensions: Array<ExtensionInformation> = new Array<ExtensionInformation>();
                var deletedExtensions: Array<ExtensionInformation> = new Array<ExtensionInformation>();
                var updatedFiles: Array<File> = new Array<File>();
                var actionList = new Array<Promise<void | boolean>>();

                if (res) {
                    var keys = Object.keys(res.files);
                    if (keys.indexOf(en.FILE_CLOUDSETTINGS_NAME) > -1) {
                        var cloudSett: CloudSetting = JSON.parse(res.files[en.FILE_CLOUDSETTINGS_NAME].content);
                        var stat: boolean = (syncSetting.lastUpload == cloudSett.lastUpload) || (syncSetting.lastDownload == cloudSett.lastUpload);

                        if (!syncSetting.forceDownload) {
                            if (stat) {
                                vscode.window.setStatusBarMessage("");
                                vscode.window.setStatusBarMessage("Sync : You already have latest version of saved settings.", 5000);
                                return;
                            }
                        }
                        syncSetting.lastDownload = cloudSett.lastUpload;
                    }

                    keys.forEach(fileName => {
                        if (res.files[fileName].content) {
                            if (fileName.indexOf(".") > -1) {
                                var f: File = new File(fileName, res.files[fileName].content, null);
                                updatedFiles.push(f);
                            }
                        }
                    });

                    for (var index = 0; index < updatedFiles.length; index++) {

                        var file: File = updatedFiles[index];
                        var path: string = null;
                        var writeFile: boolean = false;
                        var sourceKeyBinding: boolean = false;
                        var keyBindingWritten: boolean = false;
                        var content: string = null;

                        switch (file.fileName) {
                            case en.FILE_LAUNCH_NAME: {
                                writeFile = true;
                                path = en.FILE_LAUNCH;
                                content = file.content;

                                break;
                            }
                            case en.FILE_SETTING_NAME: {
                                writeFile = true;
                                path = en.FILE_SETTING;
                                content = file.content;

                                break;
                            }
                            case en.FILE_KEYBINDING_DEFAULT: {
                                writeFile = true;
                                path = en.FILE_KEYBINDING;

                                if (!keyBindingWritten) {
                                    if (en.OsType == OsType.Mac) {
                                        var specifiedKeybindingIndex: number = updatedFiles.findIndex(a => a.fileName == en.FILE_KEYBINDING_MAC)
                                        content = updatedFiles[specifiedKeybindingIndex].content;
                                    }
                                    else {
                                        var specifiedKeybindingIndex: number = updatedFiles.findIndex(a => a.fileName == en.FILE_KEYBINDING_DEFAULT)
                                        content = updatedFiles[specifiedKeybindingIndex].content;
                                    }
                                    sourceKeyBinding = true;
                                }
                                break;
                            }
                            case en.FILE_KEYBINDING_MAC: {
                                writeFile = true;
                                path = en.FILE_KEYBINDING;

                                if (!keyBindingWritten) {
                                    if (en.OsType == OsType.Mac) {
                                        var specifiedKeybindingIndex: number = updatedFiles.findIndex(a => a.fileName == en.FILE_KEYBINDING_MAC)
                                        content = updatedFiles[specifiedKeybindingIndex].content;
                                    }
                                    else {
                                        var specifiedKeybindingIndex: number = updatedFiles.findIndex(a => a.fileName == en.FILE_KEYBINDING_DEFAULT)
                                        content = updatedFiles[specifiedKeybindingIndex].content;
                                    }
                                    sourceKeyBinding = true;
                                }
                                break;
                            }
                            case en.FILE_LOCALE_NAME: {
                                writeFile = true;
                                path = en.FILE_LOCALE;
                                content = file.content;
                                break;
                            }
                            case en.FILE_EXTENSION_NAME: {
                                writeFile = false;

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
                                                common.LogException(rej, common.ERROR_MESSAGE);
                                            }));
                                    } (deletedExtension, en.ExtensionFolder));

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
                                break;
                            }
                            default: {
                                writeFile = true;
                                if (file.fileName.indexOf("keybinding") == -1) {
                                    if (file.fileName.indexOf(".") > -1) {
                                        await FileManager.CreateDirectory(en.FOLDER_SNIPPETS);
                                        var snippetFile = en.FOLDER_SNIPPETS.concat(file.fileName);//.concat(".json");
                                        path = snippetFile;
                                        content = file.content;
                                    }
                                }
                                break;
                            }
                        }
                        if (writeFile) {
                            if (sourceKeyBinding) {
                                keyBindingWritten = true;
                            }
                            writeFile = false;
                            await actionList.push(FileManager.WriteFile(path, content).then(
                                function (added: boolean) {
                                    //TODO : add Name attribute in File and show information message here with name , when required.
                                }, function (error: any) {
                                    common.LogException(error, common.ERROR_MESSAGE);
                                    return;
                                }
                            ));
                        }
                    }
                }
                else {
                    console.log(res);
                    vscode.window.showErrorMessage("GIST UNABLE TO READ");
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
                                //vscode.window.showInformationMessage("Sync : Download Complete.");
                                if (syncSetting.showSummary) {
                                    common.GenerateSummmaryFile(false, updatedFiles, deletedExtensions, addedExtensions, syncSetting);
                                }
                                vscode.window.setStatusBarMessage("");
                                vscode.window.setStatusBarMessage("Sync : Download Complete.", 5000);
                                watcherThroughUpdate = false;
                            }
                            else {
                                vscode.window.showErrorMessage("Sync : Unable to save extension settings file.")
                            }
                        }, function (errSave: any) {
                            common.LogException(errSave, common.ERROR_MESSAGE);
                            return;
                        });
                    })
                    .catch(function (e) {
                        common.LogException(e, common.ERROR_MESSAGE);
                    });
            }, function (err: any) {
                common.LogException(err, common.ERROR_MESSAGE);
                return;
            });
        }
    });

    var resetSettings = vscode.commands.registerCommand('extension.resetSettings', async () => {
        var en: Environment = new Environment(context);
        var fManager: FileManager;
        var common: commons.Commons = new commons.Commons(en);
        var syncSetting: LocalSetting = new LocalSetting();

        await common.InitSettings().then(async (resolve) => {
            syncSetting = resolve;
            await Init();
        }, (reject) => {
            common.LogException(reject, common.ERROR_MESSAGE);

        });
        async function Init() {
            vscode.window.setStatusBarMessage("Sync : Resetting Your Settings.", 2000);
            try {
                syncSetting = new LocalSetting();
                syncSetting.Version = Environment.CURRENT_VERSION;

                await common.SaveSettings(syncSetting).then(function (added: boolean) {
                    if (added) {
                        vscode.window.showInformationMessage("GIST ID and Github Token Cleared.");
                    }
                }, function (err: any) {
                    common.LogException(err, common.ERROR_MESSAGE);
                    return;
                });

            }
            catch (err) {
                common.LogException(err, "Unable to clear settings. Error Logged on console. Please open an issue.");
            }
        }

    });

    var howSettings = vscode.commands.registerCommand('extension.HowSettings', async () => {
        openurl("http://shanalikhan.github.io/2015/12/15/Visual-Studio-Code-Sync-Settings.html");
    });

    var otherOptions = vscode.commands.registerCommand('extension.otherOptions', async () => {
        var en: Environment = new Environment(context);
        var common: commons.Commons = new commons.Commons(en);
        var setting: LocalSetting = null;
        //var myGi: GithubService = null;
        var tokenAvailable: boolean = false;
        var gistAvailable: boolean = false;

        await common.InitSettings().then(async function (set: any) {
            if (set) {
                setting = set;
                tokenAvailable = setting.Token != null && setting.Token != "";
                gistAvailable = setting.Gist != null && setting.Gist != "";
                if (tokenAvailable) {
                    //myGi = new GithubService(setting.Token);
                }

            }

        }, function (err: any) {
            common.LogException(err, "Unable to toggle summary. Please open an issue.");
        });

        let items: Array<string> = new Array<string>();
        items.push("Sync : Open Extension Settings");
        items.push("Sync : Toggle Public / Private GIST Mode & Reset GIST");
        items.push("Sync : Fetch Other User's Settings");
        items.push("Sync : Open Issue");
        items.push("Sync : Release Notes");
        items.push("Sync : Toggle Auto-Download On Startup");
        items.push("Sync : Toggle Show Summary Page On Upload / Download");
        items.push("Sync : Toggle Force Download");

        var selectedItem: Number = 0;
        var settingChanged: boolean = false;



        var teims = vscode.window.showQuickPick(items).then(async (resolve: string) => {

            switch (resolve) {
                case items[0]: {
                    openurl("http://shanalikhan.github.io/2016/07/31/Visual-Studio-code-sync-setting-edit-manually.html");
                    vscode.window.showInformationMessage("Sync : URL Opened displaying about the settings options in details.");
                    var fsetting: vscode.Uri = vscode.Uri.file(en.APP_SETTINGS);
                    vscode.workspace.openTextDocument(fsetting).then((a: vscode.TextDocument) => {
                        vscode.window.showTextDocument(a, 1, false);
                    });
                    break;
                }
                case items[1]: {
                    // set gist public
                    settingChanged = true;
                    selectedItem = 2;
                    if (setting.publicGist) {
                        setting.publicGist = false;
                    }
                    else {
                        setting.publicGist = true;
                    }
                    setting.Gist = null;
                    setting.lastDownload = null;
                    setting.lastUpload = null;
                    break;

                }
                case items[2]: {

                    selectedItem = 3;

                    if (tokenAvailable) {
                        await common.GetGistAndSave(setting).then(function (gist: string) {
                            if (gist) {
                                settingChanged = true;
                                setting.allowUpload = false;
                                setting.Gist = gist;

                            }
                            else {
                                vscode.window.showErrorMessage("GIST NOT SAVED");
                                return;
                            }
                        }, function (err: any) {
                            common.LogException(err, common.ERROR_MESSAGE);
                            selectedItem = 0;
                            return;
                        });
                    }
                    else {
                        vscode.window.showErrorMessage("Token Not Set.");
                        return;
                    }
                    break;
                }
                case items[3]: {
                    openurl("https://github.com/shanalikhan/code-settings-sync/issues/new");
                    break;
                }
                case items[4]: {
                    openurl("http://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html");
                    break;
                }
                case items[5]: {
                    //auto downlaod on startup
                    selectedItem = 6;
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
                case items[6]: {
                    //page summary toggle
                    selectedItem = 7;
                    settingChanged = true;

                    if (!tokenAvailable || !gistAvailable) {
                        vscode.commands.executeCommand('extension.HowSettings');
                        return;
                    }
                    if (setting.showSummary) {
                        setting.showSummary = false;
                    }
                    else {
                        setting.showSummary = true;
                    }
                    break;
                }
                case items[7]: {
                    //toggle force download
                    selectedItem = 8;
                    settingChanged = true;
                    if (setting.forceDownload) {
                        setting.forceDownload = false;
                    }
                    else {
                        setting.forceDownload = true;
                    }
                    break;
                }
                default: {
                    break;
                }
            }
        }, (reject) => {
            common.LogException(reject, "Error");

            return;
        }).then(async (resolve: any) => {
            if (settingChanged) {
                await common.SaveSettings(setting).then(async function (added: boolean) {
                    if (added) {
                        switch (selectedItem) {
                            case 2: {
                                if (setting.publicGist) {
                                    vscode.window.showInformationMessage("Sync : GIST Reset! Public GIST Enabled. Upload Now to get new GIST ID.");
                                }
                                else {
                                    vscode.window.showInformationMessage("Sync : GIST Reset! Private GIST Enabled. Upload Now to get new GIST ID.");
                                }
                                break;
                            }
                            case 3: {
                                vscode.window.showInformationMessage("Sync : Configured! Now you can download the settings when the GIST Changes.");
                                vscode.commands.executeCommand('extension.downloadSettings');
                                break;
                            }
                            case 6: {
                                if (setting.autoDownload) {
                                    vscode.window.showInformationMessage("Sync : Auto Download turned ON upon VSCode Startup.");
                                }
                                else {
                                    vscode.window.showInformationMessage("Sync : Auto Download turned OFF upon VSCode Startup.");
                                }
                                break;
                            }
                            case 7: {
                                if (setting.showSummary) {
                                    vscode.window.showInformationMessage("Sync : Summary Will be shown upon download / upload.");
                                }
                                else {
                                    vscode.window.showInformationMessage("Sync : Summary Will be hidden upon download / upload.");
                                }
                                break;
                            }
                            case 8: {
                                if (setting.forceDownload) {
                                    vscode.window.showInformationMessage("Sync : Force Download Turned On.");
                                }
                                else {
                                    vscode.window.showInformationMessage("Sync : Force Download Turned Off.");
                                }
                                break;
                            }
                        }
                    }
                    else {
                        vscode.window.showErrorMessage("Unable to Toggle.");
                    }
                }, function (err: any) {
                    common.LogException(err, "Unable to toggle. Please open an issue.");
                    return;

                });
            }

        }, (reject: any) => {
            common.LogException(reject, "Error");
            return;
        });
    });

    context.subscriptions.push(updateSettings);
    context.subscriptions.push(downloadSettings);
    context.subscriptions.push(resetSettings);
    context.subscriptions.push(howSettings);
    context.subscriptions.push(otherOptions);
    // context.subscriptions.push(releaseNotes);
    // context.subscriptions.push(openSettings);

    // context.subscriptions.push(openIssue);
    // context.subscriptions.push(autoSync);
    // context.subscriptions.push(summary);


}
