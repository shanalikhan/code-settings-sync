// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below



import * as vscode from 'vscode';
import * as pluginService from './pluginService';

import * as path from 'path';
import * as envir from './environmentPath';
import * as fileManager from './fileManager';
import * as commons from './commons';
import * as myGit from './githubService';


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

    var TOKEN: string = null;
    var GIST: string = null;

    var disposable = vscode.commands.registerCommand('extension.updateSettings', () => {
        var en: envir.Environment = new envir.Environment(context);
        var common: commons.Commons = new commons.Commons(en);
        var myGi: myGit.GithubService = null;

        function Init() {

            vscode.window.setStatusBarMessage("Checking for Github Token and GIST.", 2000);
            common.TokenFileExists().then(function(tokenExists: boolean) {
                if (tokenExists) {
                    fileManager.FileManager.ReadFile(en.FILE_TOKEN).then(function(token: string) {
                        TOKEN = token;
                        myGi = new myGit.GithubService(TOKEN, en);
                        common.GISTFileExists().then(function(gistExists: boolean) {
                            if (gistExists) {
                                fileManager.FileManager.ReadFile(en.FILE_GIST).then(function(gist: string) {
                                    GIST = gist;
                                    vscode.window.setStatusBarMessage("Uploading / Updating Your Settings In Github.", 2000);
                                    startGitProcess();
                                });

                            }
                            else {
                                GIST = null;
                                vscode.window.setStatusBarMessage("Uploading / Updating Your Settings In Github.", 2000);
                                startGitProcess();
                            }

                        });
                    });
                }
                else {
                    openurl("https://github.com/settings/tokens");
                    common.GetTokenAndSave().then(function(saved: boolean) {
                        if (saved) {
                            Init();
                        }
                    })
                }
            }, function(err: boolean) {

            });
        }


        async function startGitProcess() {

            if (TOKEN != null) {
                var settingtext: string = "//setting";
                var launchtext: string = "//launch";
                var keybindingtext: string = "//keybinding";
                var extensiontext = "";

                await fileManager.FileManager.ReadFile(en.FILE_SETTING).then(async function(settings: string) {
                    if (settings) {
                        settingtext = settings;

                    }
                });

                await fileManager.FileManager.ReadFile(en.FILE_LAUNCH).then(async function(launch: string) {
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

                if (GIST == null) {
                    await myGi.CreateNewGist(settingtext, launchtext, keybindingtext, extensiontext, snippetFiles).then(function(gistID: string) {
                        
                        fileManager.FileManager.WriteFile(en.FILE_GIST, gistID).then(function(added: boolean) {
                            if (added) {
                                vscode.window.showInformationMessage("Uploaded Successfully." + " GIST ID :  " + gistID + " . Please copy and use this ID in other machines to sync all settings.");
                                vscode.window.setStatusBarMessage("Gist Saved.", 1000);
                            }
                        }, function(error: any) {
                            console.error(error);

                        });

                    }, function(error: any) {
                        vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                    });
                }
                else if (GIST != null) {
                    await myGi.ExistingGist(GIST, settingtext, launchtext, keybindingtext, extensiontext, snippetFiles).then(function(added: boolean) {
                        vscode.window.showInformationMessage("Settings Updated Successfully");

                    }, function(error: any) {
                        vscode.window.showErrorMessage(common.ERROR_MESSAGE);

                    });
                }
            }
            else {
                vscode.window.showErrorMessage("ERROR ! Github Account Token Not Set");
            }
        }

        Init();

    });


    var disposable = vscode.commands.registerCommand('extension.downloadSettings', () => {

        var en: envir.Environment = new envir.Environment(context);
        var fManager: fileManager.FileManager;
        var common: commons.Commons = new commons.Commons(en);


        function Init() {

            vscode.window.setStatusBarMessage("Checking for Github Token and GIST.", 2000);
            common.TokenFileExists().then(function(tokenExists: boolean) {
                if (tokenExists) {
                    fileManager.FileManager.ReadFile(en.FILE_TOKEN).then(function(token: string) {
                        TOKEN = token;
                        common.GISTFileExists().then(function(gistExists: boolean) {
                            if (gistExists) {
                                fileManager.FileManager.ReadFile(en.FILE_GIST).then(function(gist: string) {
                                    GIST = gist;
                                    vscode.window.setStatusBarMessage("Downloading Your Settings...", 2000);
                                    StartDownload();
                                });
                            }
                            else {
                                common.GetGistAndSave().then(function(saved: boolean) {
                                    if (saved) {
                                        Init();
                                    }
                                })
                            }
                        });
                    })
                }
                else {
                    openurl("https://github.com/settings/tokens");
                    common.GetTokenAndSave().then(function(saved: boolean) {
                        if (saved) {
                            Init();
                        }
                    })
                }
            }, function(err: boolean) {

            });


        }

        function StartDownload() {
            github.getGistsApi().get({ id: GIST }, function(er, res) {

                if (er) {
                    vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                    console.log(er);
                    return false;
                }

                var keys = Object.keys(res.files);
                for (var i: number = 0; i < keys.length; i++) {
                    switch (keys[i]) {
                        case "launch": {
                            fs.writeFile(en.FILE_LAUNCH, res.files.launch.content, function(err, data) {
                                if (err) {
                                    vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                                    console.log(err);
                                    return false;
                                }
                                vscode.window.showInformationMessage("Launch Settings downloaded Successfully");
                                // console.log("launch");
                                // console.log(data);
                            });
                            break;
                        }
                        case "settings": {
                            fs.writeFile(en.FILE_SETTING, res.files.settings.content, function(err, data) {
                                if (err) {
                                    vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                                    console.log(err);
                                    return false;
                                }
                                vscode.window.showInformationMessage("Editor Settings downloaded Successfully");
                                // console.log("setting");
                                // console.log(data);
                            });
                            break;
                        }
                        case "keybindings": {
                            fs.writeFile(en.FILE_KEYBINDING, res.files.keybindings.content, function(err, data) {
                                if (err) {
                                    vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                                    console.log(err);
                                    return false;
                                }
                                vscode.window.showInformationMessage("Keybinding Settings downloaded Successfully");
                            });
                            break;
                        }
                        case "extensions": {
                            var remoteList = pluginService.ExtensionInformation.fromJSONList(res.files.extensions.content);
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
                                if (!fs.existsSync(en.FOLDER_SNIPPETS)) {
                                    fs.mkdirSync(en.FOLDER_SNIPPETS);
                                }
                                var file = en.FOLDER_SNIPPETS.concat(keys[i]).concat(".json");
                                var fileName = keys[i].concat(".json");
                                fs.writeFile(file, res.files[keys[i]].content, function(err, data) {
                                    if (err) {
                                        vscode.window.showErrorMessage(common.ERROR_MESSAGE);
                                        console.log(err);
                                        return false;
                                    }
                                    vscode.window.showInformationMessage(fileName + " snippet added successfully.");
                                });
                            }

                            break;
                        }
                    }
                }
            });
        }
        Init();
    });

    var disposable = vscode.commands.registerCommand('extension.resetSettings', () => {
        var en: envir.Environment = new envir.Environment(context);
        var fManager: fileManager.FileManager;
        var common: commons.Commons = new commons.Commons(en);
        vscode.window.setStatusBarMessage("Resetting Your Settings.", 2000);
        try {
            if (fs.existsSync(en.FILE_GIST)) {
                fs.unlinkSync(en.FILE_GIST);
            }
            if (fs.existsSync(en.FILE_TOKEN)) {
                fs.unlinkSync(en.FILE_TOKEN);
            }
            vscode.window.showInformationMessage("GIST ID and Github Token Cleared.");
        }
        catch (err) {
            console.log(err);
            vscode.window.showErrorMessage("Unable to clear settings. Error Logged on console. Please open an issue.");
        }
    });

    context.subscriptions.push(disposable);
}
