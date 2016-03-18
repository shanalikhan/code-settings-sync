// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below



import * as vscode from 'vscode';
import * as pluginService from './pluginService';

import * as path from 'path';
import * as envir from './environmentPath';
import * as fileManager from './fileManager';
import * as commons from './commons';
import * as myGit from './githubService';
import {Setting} from './setting';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    

    var openurl = require('open');
    var fs = require('fs');
    var GitHubApi = require("github");

    var github = new GitHubApi({
        version: "3.0.0"
    });



    var disposable = vscode.commands.registerCommand('extension.updateSettings', async () => {
        var en: envir.Environment = new envir.Environment(context);
        var common: commons.Commons = new commons.Commons(en);
        var myGi: myGit.GithubService = null;


        async function Init() {

            vscode.window.setStatusBarMessage("Checking for Github Token and GIST.", 2000);
            var syncSetting: Setting = await common.InitSettings();
            if (syncSetting.Token == null) {
                openurl("https://github.com/settings/tokens");
                await common.GetTokenAndSave(syncSetting).then(function(saved: boolean) {
                    if (saved) {
                        Init();
                        return;
                    }
                    else {
                        vscode.window.showErrorMessage("TOKEN NOT SAVED");
                        return;
                    }
                }, function(err: any) {
                    console.error(err);
                    vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                    return;
                });
            }
            else {
                vscode.window.setStatusBarMessage("Uploading / Updating Your Settings In Github.", 3000);
                await startGitProcess(syncSetting.Token, syncSetting.Gist);
                return;
            }
        }


        async function startGitProcess(token: string, gist: string) {

            if (token != null) {
                var settingtext: string = "//setting";
                var launchtext: string = "//launch";
                var keybindingtext: string = "//keybinding";
                var extensiontext = "";
                vscode.window.setStatusBarMessage("Reading Settings and Extensions.", 1000);
                await fileManager.FileManager.ReadFile(en.FILE_SETTING).then(function(settings: string) {
                    if (settings) {
                        settingtext = settings;
                    }
                });

                await fileManager.FileManager.ReadFile(en.FILE_LAUNCH).then(function(launch: string) {
                    if (launch) {
                        launchtext = launch;
                    }
                });

                await fileManager.FileManager.ReadFile(en.FILE_KEYBINDING).then(function(keybinding: string) {
                    if (keybinding) {
                        keybindingtext = keybinding;
                    }
                });

                var extensionlist = pluginService.PluginService.CreateExtensionList();
                extensionlist.sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                });
                extensiontext = JSON.stringify(extensionlist, undefined, 2);

                var snippetFiles = await fileManager.FileManager.ListFiles(en.FOLDER_SNIPPETS);

                if (gist == null) {
                    await myGi.CreateNewGist(settingtext, launchtext, keybindingtext, extensiontext, snippetFiles).then(function(gistID: string) {

                        fileManager.FileManager.WriteFile(en.FILE_GIST, gistID).then(function(added: boolean) {
                            if (added) {
                                vscode.window.showInformationMessage("Uploaded Successfully." + " GIST ID :  " + gistID + " . Please copy and use this ID in other machines to sync all settings.");
                                vscode.window.setStatusBarMessage("Gist Saved.", 1000);
                            }
                        }, function(error: any) {
                            console.error(error);
                            vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                            return;
                        });

                    }, function(error: any) {
                        vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                        return;
                    });
                }
                else if (gist != null) {
                    await myGi.ExistingGist(gist, settingtext, launchtext, keybindingtext, extensiontext, snippetFiles).then(function(added: boolean) {
                        vscode.window.showInformationMessage("Settings Updated Successfully");

                    }, function(error: any) {
                        vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                        return;
                    });
                }
            }
            else {
                vscode.window.showErrorMessage("ERROR ! Github Account Token Not Set");
            }
        }

        await Init();

    });


    var disposable = vscode.commands.registerCommand('extension.downloadSettings', async () => {

        var en: envir.Environment = new envir.Environment(context);
        var common: commons.Commons = new commons.Commons(en);
        var myGi: myGit.GithubService = null;

        async function Init() {

            vscode.window.setStatusBarMessage("Checking for Github Token and GIST.", 2000);
            var syncSetting: Setting = await common.InitSettings();
            if (syncSetting.Token == null) {
                openurl("https://github.com/settings/tokens");
                await common.GetTokenAndSave(syncSetting).then(function(saved: boolean) {
                    if (saved) {
                        Init();
                        return;
                    }
                    else {
                        vscode.window.showErrorMessage("TOKEN NOT SAVED");
                        return;
                    }
                }, function(err: any) {
                    console.error(err);
                    vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                    return;
                });
            }
            
            if (syncSetting.Gist == null) {
                await common.GetGistAndSave(syncSetting).then(function(saved: boolean) {
                    if (saved) {
                        Init();
                        return;
                    }
                    else {
                        vscode.window.showErrorMessage("GIST NOT SAVED");
                        return;
                    }
                }, function(err: any) {
                    console.error(err);
                    vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                    return;
                });
            }
            await StartDownload(syncSetting.Gist);
            
        }

        async function StartDownload(gist: string) {

            myGi.DownloadGist(gist).then(async function(res: any) {
                var keys = Object.keys(res.files);
                for (var i: number = 0; i < keys.length; i++) {
                    switch (keys[i]) {
                        case "launch.json": {
                            await fileManager.FileManager.WriteFile(en.FILE_LAUNCH, res.files["launch.json"].content).then(
                                function(added: boolean) {
                                    vscode.window.showInformationMessage("Launch Settings downloaded Successfully");
                                }, function(error: any) {
                                    vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                                    return;
                                }
                            );
                            break;
                        }
                        case "settings.json": {
                            await fileManager.FileManager.WriteFile(en.FILE_SETTING, res.files["settings.json"].content).then(
                                function(added: boolean) {
                                    vscode.window.showInformationMessage("Editor Settings downloaded Successfully");
                                }, function(error: any) {
                                    vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                                    return;
                                });
                            break;
                        }
                        case "keybindings.json": {

                            await fileManager.FileManager.WriteFile(en.FILE_KEYBINDING, res.files["keybindings.json"].content).then(
                                function(added: boolean) {
                                    vscode.window.showInformationMessage("Keybinding Settings downloaded Successfully");
                                }, function(error: any) {
                                    vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                                    return;
                                });
                            break;
                        }
                        case "extensions.json": {
                            var remoteList = pluginService.ExtensionInformation.fromJSONList(res.files["extensions.json"].content);
                            var missingList = pluginService.PluginService.GetMissingExtensions(remoteList);
                            if (missingList.length == 0) {
                                vscode.window.showInformationMessage("No extension need to be installed");
                            }
                            else {
                                var actionList = new Array<Promise<void>>();
                                vscode.window.setStatusBarMessage("Installing Extensions in background.", 4000);
                                missingList.forEach(element => {
                                    actionList.push(pluginService.PluginService.InstallExtension(element, en.ExtensionFolder)
                                        .then(function() {
                                            var name = element.publisher + '.' + element.name + '-' + element.version;
                                            vscode.window.showInformationMessage("Extension " + name + " installed Successfully");
                                        }));
                                });
                                Promise.all(actionList)
                                    .then(function() {
                                        vscode.window.showInformationMessage("Extension installed Successfully, please restart");
                                    })
                                    .catch(function(e) {
                                        console.log(e);
                                        vscode.window.showErrorMessage("Extension download failed." + common.ERROR_MESSAGE)
                                    });
                            }
                            break;
                        }
                        default: {
                            if (i < keys.length) {
                                await fileManager.FileManager.CreateDirectory(en.FOLDER_SNIPPETS);

                                var file = en.FOLDER_SNIPPETS.concat(keys[i]);//.concat(".json");
                                var fileName = keys[i]//.concat(".json");
                                await fileManager.FileManager.WriteFile(file, res.files[keys[i]].content).then(
                                    function(added: boolean) {
                                        vscode.window.showInformationMessage(fileName + " snippet added successfully.");
                                    }, function(error: any) {
                                        vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                                        return;
                                    }
                                );
                            }
                            break;
                        }
                    }
                }
            }, function(err: any) {
                vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                return;
            });
        }
        await Init();
    });

    var disposable = vscode.commands.registerCommand('extension.resetSettings', async () => {
        var en: envir.Environment = new envir.Environment(context);
        var fManager: fileManager.FileManager;
        var common: commons.Commons = new commons.Commons(en);
        vscode.window.setStatusBarMessage("Resetting Your Settings.", 2000);
        try {
            var result = await fileManager.FileManager.DeleteFile(en.FILE_TOKEN);
            var result2 = await fileManager.FileManager.DeleteFile(en.FILE_GIST);

            vscode.window.showInformationMessage("GIST ID and Github Token Cleared.");
        }
        catch (err) {
            console.log(err);
            vscode.window.showErrorMessage("Unable to clear settings. Error Logged on console. Please open an issue.");
        }
    });

    context.subscriptions.push(disposable);
}
