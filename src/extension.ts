// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below



import * as vscode from 'vscode';
import * as pluginService from './pluginService'

import * as path from 'path';
import * as envir from './environmentPath';
import * as fileManager from './fileManager';
import * as commons from './commons';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    

    var openurl = require('open');
    var fs = require('fs');
    var GitHubApi = require("github");

    var isInsiders = /insiders/.test(context.asAbsolutePath(""))
    var homeDir = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME']
    var ExtensionFolder: string = path.join(homeDir, isInsiders ? '.vscode-insiders' : '.vscode', 'extensions');

    var github = new GitHubApi({
        version: "3.0.0"
    });


    var TOKEN: string = null;
    var GIST: string = null;
    var tokenChecked: boolean = false;
    var gistChecked: boolean = false;
    var tempValue: string = "";
    var PATH: string = process.env.APPDATA
    if (!PATH) {
        if (process.platform == 'darwin')
            PATH = process.env.HOME + '/Library/Application Support';
        else if (process.platform == 'linux') {
            var os = require("os")
            PATH = os.homedir() + '/.config';
        } else
            PATH = '/var/local'
    }

    var codePath = isInsiders ? '/Code - Insiders' : '/Code';
    PATH = PATH + codePath;

    var FILE_GIST: string = PATH.concat("/User/gist_sync.txt");
    var FILE_TOKEN: string = PATH.concat("/User/token.txt");
    var FILE_SETTING: string = PATH.concat("/User/settings.json");
    var FILE_LAUNCH: string = PATH.concat("/User/launch.json");
    var FILE_KEYBINDING: string = PATH.concat("/User/keybindings.json");
    var FOLDER_SNIPPETS: string = PATH.concat("/User/snippets/");
    var ERROR_MESSAGE: string = "ERROR ! Logged In Console. Please open an issue in Github Repo."
    var GIST_JSON: any = {
        "description": "Visual Studio code settings",
        "public": false,
        "files": {
            "settings": {
                "content": ""
            },
            "launch": {
                "content": ""
            },
            "keybindings": {
                "content": ""
            },
            "extensions": {
                "content": ""
            }

        }
    };


    var disposable = vscode.commands.registerCommand('extension.SetupSettings', () => {
        var en: envir.Environment = new envir.Environment(context);
        var fManager: fileManager.FileManager = new fileManager.FileManager();
        var common: commons.Commons = new commons.Commons(en, fManager);

        vscode.window.setStatusBarMessage("Reading Settings.", 1000);
        common.FilesExist().then(
            function(filesexist) {
                vscode.window.showErrorMessage("Old Settings Found. Please reset settings to setup again.");
                return;
            }, function(err: any) {
                vscode.window.showErrorMessage(ERROR_MESSAGE);
                return;
            }
        );

        var opt = pluginService.Common.GetInputBox(true);
        //openurl("https://github.com/settings/tokens");
        vscode.window.showInputBox(opt).then((value) => {
            value = value.trim();
            if (value) {
                fManager.WriteFile(en.FILE_TOKEN, value).then(function(added: boolean) {
                    vscode.window.setStatusBarMessage("Token Saved.", 1000);

                }, function(error: any) {
                    vscode.window.showErrorMessage(ERROR_MESSAGE);

                });
            }

        });

        var opt = pluginService.Common.GetInputBox(false);
        vscode.window.showInputBox(opt).then((value) => {
            value = value.trim();
            if (value) {
                fManager.WriteFile(en.FILE_GIST, value).then(function(added: boolean) {
                    vscode.window.setStatusBarMessage("GIST Saved.", 1000);

                }, function(error: any) {
                    vscode.window.showErrorMessage(ERROR_MESSAGE);

                });;
            }
        });
    });


    var disposable = vscode.commands.registerCommand('extension.updateSettings', () => {


        tempValue = "";
        vscode.window.setStatusBarMessage("Checking for Github Token and GIST.", 2000);
        tokenChecked = false;
        gistChecked = false;


        function Init() {

            vscode.window.setStatusBarMessage("Checking for Github Token and GIST.", 2000);


        }


        function ReadTokenFileResult(err: any, data: any) {

            if (!data) {
                var opt = pluginService.Common.GetInputBox(true);
                openurl("https://github.com/settings/tokens");
                vscode.window.showInputBox(opt).then((value) => {
                    value = value.trim();
                    if (value) {
                        tempValue = value;
                        fs.writeFile(FILE_TOKEN, value, WriteTokenFileResult);
                    }

                });
            }
            else {
                TOKEN = data;
                ReadGist();
            }
        };


        function WriteTokenFileResult(err: any, data: any) {
            if (err) {
                vscode.window.showErrorMessage(ERROR_MESSAGE);
                console.log(err);
                return false;
            }
            TOKEN = tempValue;
            ReadGist();
        };

        function ReadGist() {

            fs.readFile(FILE_GIST, { encoding: 'utf8' }, ReadGistFileResult);
        };
        function ReadGistFileResult(err: any, data: any) {
            if (err) {
                if (err.code != "ENOENT") {
                    vscode.window.showErrorMessage(ERROR_MESSAGE);
                    console.log(err);
                    return false;
                }
            }
            if (data) {
                GIST = data;
            }
            else {
                GIST = null;
            }
            vscode.window.setStatusBarMessage("Uploading / Updating Your Settings In Github.", 2000);
            startGitProcess();
        };







        function CreateNewGist(settingtext: string, launchtext: string, keybindingtext: string, extensiontext: string) {
            github.authenticate({
                type: "oauth",
                token: TOKEN
            });

            if (fs.existsSync(FOLDER_SNIPPETS)) {
                //create new gist and upload all files there
                var list = fs.readdirSync(FOLDER_SNIPPETS);
                for (var i: number = 0; i < list.length; i++) {
                    var fileName = list[i];
                    var filePath = FOLDER_SNIPPETS.concat(fileName);
                    var fileText: string = fs.readFileSync(filePath, { encoding: 'utf8' });
                    var jsonObjName = fileName.split('.')[0];
                    var obj = {};
                    obj[jsonObjName] = {};
                    obj[jsonObjName].content = fileText;
                    GIST_JSON.files[jsonObjName] = {};
                    GIST_JSON.files[jsonObjName].content = fileText;
                    //debugger;
                }
            }

            GIST_JSON.files.settings.content = settingtext;
            GIST_JSON.files.launch.content = launchtext;
            GIST_JSON.files.keybindings.content = keybindingtext;
            GIST_JSON.files.extensions.content = extensiontext;

            github.getGistsApi().create(GIST_JSON
                , function(err, res) {
                    if (err) {
                        vscode.window.showErrorMessage(ERROR_MESSAGE);
                        console.log(err);
                        return false;
                    }
                    vscode.window.showInformationMessage("Uploaded Successfully." + " GIST ID :  " + res.id + " . Please copy and use this ID in other machines to sync all settings.");
                    fs.writeFile(FILE_GIST, res.id, function(err, data) {
                        if (err) {
                            vscode.window.showErrorMessage("ERROR ! Unable to Save GIST ID In this machine. You need to enter it manually from Download Settings.");
                            console.log(err);
                            return false;
                        }
                        vscode.window.showInformationMessage("GIST ID Saved in your machine.");

                    });

                });
        };

        function ExistingGist(settingtext: string, launchtext: string, keybindingtext: string, extensiontext: string) {
            github.authenticate({
                type: "oauth",
                token: TOKEN
            });

            github.getGistsApi().get({ id: GIST }, function(er, res) {

                if (er) {
                    vscode.window.showErrorMessage(ERROR_MESSAGE);
                    console.log(er);
                    return false;
                }
                else {
                    if (fs.existsSync(FOLDER_SNIPPETS)) {
                        var list = fs.readdirSync(FOLDER_SNIPPETS);
                        for (var i: number = 0; i < list.length; i++) {
                            var fileName = list[i];
                            var filePath = FOLDER_SNIPPETS.concat(fileName);
                            var fileText: string = fs.readFileSync(filePath, { encoding: 'utf8' });
                            var jsonObjName = fileName.split('.')[0];
                            res.files[jsonObjName] = {};
                            res.files[jsonObjName].content = fileText;
                        }
                    }
                    res.files.settings.content = settingtext;
                    res.files.launch.content = launchtext;
                    res.files.keybindings.content = keybindingtext;
                    if (res.files.extensions) {
                        res.files.extensions.content = extensiontext;
                    }
                    else {
                        vscode.window.showInformationMessage("Announcement : Extension Sync feature has been Added. You need to Reset Settings Or Manually Remove GIST ID File in order to sync your extensions.");
                    }


                    github.getGistsApi().edit(res, function(ere, ress) {
                        if (ere) {
                            vscode.window.showErrorMessage(ERROR_MESSAGE);
                            console.log(ere);
                            return false;
                        }
                        vscode.window.showInformationMessage("Settings Updated Successfully");
                    });
                }

            });
        };

        function startGitProcess() {

            if (TOKEN != null) {

                var settingtext: string = "//setting";
                var launchtext: string = "//launch";
                var keybindingtext: string = "//keybinding";
                var extensiontext = "";

                if (fs.existsSync(FILE_SETTING)) {
                    settingtext = fs.readFileSync(FILE_SETTING, { encoding: 'utf8' });
                }
                if (fs.existsSync(FILE_LAUNCH)) {
                    launchtext = fs.readFileSync(FILE_LAUNCH, { encoding: 'utf8' });
                }
                if (fs.existsSync(FILE_KEYBINDING)) {
                    keybindingtext = fs.readFileSync(FILE_KEYBINDING, { encoding: 'utf8' });
                }

                var extensionlist = pluginService.PluginService.CreateExtensionList();
                extensionlist.sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                });
                extensiontext = JSON.stringify(extensionlist, undefined, 2);


                if (GIST == null) {
                    CreateNewGist(settingtext, launchtext, keybindingtext, extensiontext);
                }
                else if (GIST != null) {
                    ExistingGist(settingtext, launchtext, keybindingtext, extensiontext);

                }
            }
            else {
                vscode.window.showErrorMessage("ERROR ! Github Account Token Not Set");
            }


        }

        function Initialize() {
            if (fs.existsSync(FILE_TOKEN)) {
                fs.readFile(FILE_TOKEN, { encoding: 'utf8' }, ReadTokenFileResult);
            }
            else {
                openurl("https://github.com/settings/tokens");
                var opt = pluginService.Common.GetInputBox(true);
                vscode.window.showInputBox(opt).then((value) => {
                    if (value) {
                        value = value.trim();
                        tempValue = value;
                        fs.writeFile(FILE_TOKEN, value, WriteTokenFileResult);
                    }
                });
            }

        } 
        
        
        
        //// start here
        Initialize();
        // TokenFileExists().then(function(data) {
        //     debugger;
        // }, function(err) {

        // });

    });


    var disposable = vscode.commands.registerCommand('extension.downloadSettings', () => {
        vscode.window.setStatusBarMessage("Downloading Your Settings...", 2000);

        var tokenChecked: boolean = false;
        var gistChecked: boolean = false;


        function ReadTokenFileResult(err: any, data: any) {
            if (err) {
                vscode.window.showErrorMessage(ERROR_MESSAGE);
                console.log(err);
                return false;
            }
            if (!data) {
                openurl("https://github.com/settings/tokens");
                var opt = pluginService.Common.GetInputBox(false);
                vscode.window.showInputBox(opt).then((value) => {
                    if (value) {
                        value = value.trim();
                        tempValue = value;
                        fs.writeFile(FILE_TOKEN, value, WriteTokenFileResult);
                    }
                });
            }
            else {
                TOKEN = data;
                ReadGist();
            }

        };

        function WriteTokenFileResult(err: any, data: any) {
            if (err) {
                vscode.window.showErrorMessage(ERROR_MESSAGE);
                console.log(err);
                return false;
            }
            TOKEN = tempValue;
            ReadGist();
        }

        function ReadGist() {
            fs.readFile(FILE_GIST, { encoding: 'utf8' }, ReadGistFileResult);
        };

        function ReadGistFileResult(err: any, data: any) {

            if (!data) {
                var opt = pluginService.Common.GetInputBox(false);
                vscode.window.showInputBox(opt).then((value) => {
                    if (value) {
                        value = value.trim();
                        tempValue = value;
                        fs.writeFile(FILE_GIST, value, WriteGistFileResult);
                    }
                });
            }
            else {
                GIST = data;
                StartDownload();
            }
        };

        function WriteGistFileResult(err: any, data: any) {
            if (err) {
                vscode.window.showErrorMessage(ERROR_MESSAGE);
                console.log(err);
                return false;
            }
            GIST = tempValue;
            StartDownload();
        };

        function StartDownload() {
            github.getGistsApi().get({ id: GIST }, function(er, res) {

                if (er) {
                    vscode.window.showErrorMessage(ERROR_MESSAGE);
                    console.log(er);
                    return false;
                }

                var keys = Object.keys(res.files);
                for (var i: number = 0; i < keys.length; i++) {
                    switch (keys[i]) {
                        case "launch": {
                            fs.writeFile(FILE_LAUNCH, res.files.launch.content, function(err, data) {
                                if (err) {
                                    vscode.window.showErrorMessage(ERROR_MESSAGE);
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
                            fs.writeFile(FILE_SETTING, res.files.settings.content, function(err, data) {
                                if (err) {
                                    vscode.window.showErrorMessage(ERROR_MESSAGE);
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
                            fs.writeFile(FILE_KEYBINDING, res.files.keybindings.content, function(err, data) {
                                if (err) {
                                    vscode.window.showErrorMessage(ERROR_MESSAGE);
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
                                    actionList.push(pluginService.PluginService.InstallExtension(element, ExtensionFolder)
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
                                        vscode.window.showErrorMessage("Extension download failed." + ERROR_MESSAGE)
                                    });
                            }

                            break;
                        }
                        default: {
                            if (i < keys.length) {
                                if (!fs.existsSync(FOLDER_SNIPPETS)) {
                                    fs.mkdirSync(FOLDER_SNIPPETS);
                                }
                                var file = FOLDER_SNIPPETS.concat(keys[i]).concat(".json");
                                var fileName = keys[i].concat(".json");
                                fs.writeFile(file, res.files[keys[i]].content, function(err, data) {
                                    if (err) {
                                        vscode.window.showErrorMessage(ERROR_MESSAGE);
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

        function Initialize() {
            if (fs.existsSync(FILE_TOKEN)) {
                fs.readFile(FILE_TOKEN, { encoding: 'utf8' }, ReadTokenFileResult);
            }
            else {
                openurl("https://github.com/settings/tokens");
                var opt = pluginService.Common.GetInputBox(true);
                vscode.window.showInputBox(opt).then((value) => {
                    if (value) {
                        value = value.trim();
                        tempValue = value;
                        fs.writeFile(FILE_TOKEN, value, WriteTokenFileResult);
                    }
                });

            }
        }

        Initialize();

    });

    var disposable = vscode.commands.registerCommand('extension.resetSettings', () => {
        vscode.window.setStatusBarMessage("Resetting Your Settings.", 2000);
        try {
            if (fs.existsSync(FILE_GIST)) {
                fs.unlinkSync(FILE_GIST);
            }
            if (fs.existsSync(FILE_TOKEN)) {
                fs.unlinkSync(FILE_TOKEN);
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
