// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    var openurl = require('open');
    var fs = require('fs');
    var GitHubApi = require("github");

    var github = new GitHubApi({
        // required
        version: "3.0.0"
    });



    var TOKEN: string = null;
    var GIST: string = null;
    var tokenChecked: boolean = false;
    var gistChecked: boolean = false;
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    var PATH: string = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + 'Library/Preference' : '/var/local');
    var FILE_GIST: string = PATH.concat("\\Code\\User\\gist_sync.txt");
    var FILE_TOKEN: string = PATH.concat("\\Code\\User\\token.txt");
    var FILE_SETTING: string = PATH.concat("\\Code\\User\\settings.json");
    var FILE_LAUNCH: string = PATH.concat("\\Code\\User\\launch.json");
    var FILE_KEYBINDING: string = PATH.concat("\\Code\\User\\keybindings.json");
    var FOLDER_SNIPPETS: string = PATH.concat("\\Code\\User\\snippets\\");
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
            }

        }
    };




    var disposable = vscode.commands.registerCommand('extension.updateSettings', () => {


        vscode.window.setStatusBarMessage("Loading Your Settings.", 5000);
        tokenChecked = false;
        gistChecked = false;


        fs.readFile(FILE_TOKEN, { encoding: 'utf8' }, function read(err, data) {

            if (!data) {
                let options: vscode.InputBoxOptions = {
                    placeHolder: "Enter Github Personal Access Token",
                    password: false,
                    prompt: "Link is opened to get the github token"
                };
                openurl("https://github.com/settings/tokens");
                vscode.window.showInputBox(options).then((value) => {
                    value = value.trim();
                    if (value) {
                        fs.writeFile(FILE_TOKEN, value, function(err, data) {
                            if (err) {
                                vscode.window.showErrorMessage("ERROR ! See detail on console.");
                                console.log(err);
                                return false;
                            }
                            TOKEN = value;
                            InitGist("token");
                        });
                    }
                });
            }
            else {
                TOKEN = data;
                InitGist("token");
            }
        });


        fs.readFile(FILE_GIST, { encoding: 'utf8' }, function read(err, data) {

            if (err) {
                if (err.code != "ENOENT") {
                    vscode.window.showErrorMessage("ERROR ! See detail on console.");
                    console.log(err);
                    return false;
                }
            }
            GIST = data;
            InitGist("gist");


        });

        function InitGist(type) {
            switch (type) {
                case "token": {
                    tokenChecked = true;
                    break;
                }
                case "gist": {
                    gistChecked = true;
                    break;
                }
            }
            if ((gistChecked) && (tokenChecked)) {
                vscode.window.setStatusBarMessage("Uploading / Updating Your Settings In Github.", 2000);
                startGitProcess();
            }

        }

        function startGitProcess() {

            if (TOKEN != null) {
                var settingtext: string = "//setting";
                var launchtext: string = "//lanuch";
                var keybindingtext: string = "//keybinding";

                if (fs.existsSync(FILE_SETTING)) {
                    settingtext = fs.readFileSync(FILE_SETTING, { encoding: 'utf8' });
                }
                if (fs.existsSync(FILE_LAUNCH)) {
                    launchtext = fs.readFileSync(FILE_LAUNCH, { encoding: 'utf8' });
                }
                if (fs.existsSync(FILE_KEYBINDING)) {
                    keybindingtext = fs.readFileSync(FILE_KEYBINDING, { encoding: 'utf8' });
                }


                if (GIST == null) {
                    console.log("READY");
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

                    github.getGistsApi().create(GIST_JSON
                        , function(err, res) {
                            if (err) {
                                vscode.window.showErrorMessage("ERROR ! See detail on console.");
                                console.log(err);
                            }
                            vscode.window.showInformationMessage("Settings Updated Successfully");
                            fs.writeFile(FILE_GIST, res.id, function(err, data) {
                                if (err) {
                                    vscode.window.showErrorMessage("ERROR ! See detail on console.");
                                    console.log(err);
                                    return false;
                                }
                                vscode.window.showInformationMessage("GIST ID :  " + res.id + " . Please copy this ID and insert this on other machines to sync across multiple machines.");

                            });

                        });
                }
                else if (GIST != null) {
                    github.authenticate({
                        type: "oauth",
                        token: TOKEN
                    });

                    github.getGistsApi().get({ id: GIST }, function(er, res) {

                        if (fs.existsSync(FOLDER_SNIPPETS)) {
                            var list = fs.readdirSync(FOLDER_SNIPPETS);
                            for (var i: number = 0; i < list.length; i++) {
                                var fileName = list[i];
                                var filePath = FOLDER_SNIPPETS.concat(fileName);
                                var fileText: string = fs.readFileSync(filePath, { encoding: 'utf8' });
                                var jsonObjName = fileName.split('.')[0];
                                res.files[jsonObjName] = {};
                                res.files[jsonObjName].content = fileText;
                                //debugger;
                            }
                        }
                        res.files.settings.content = settingtext;
                        res.files.launch.content = launchtext;
                        res.files.keybindings.content = keybindingtext;
                        github.getGistsApi().edit(res, function(ere, ress) {
                            if (ere) {
                                vscode.window.showErrorMessage("ERROR ! See detail on console.");
                                console.log(ere);
                                return false;
                            }
                            vscode.window.showInformationMessage("Settings Updated Successfully");
                            //console.log(ress);
                        });
                    });

                }
            }


        }
    });


    var disposable = vscode.commands.registerCommand('extension.downloadSettings', () => {
        var tokenChecked: boolean = false;
        var gistChecked: boolean = false;

        function InitalizeTokenandGIST() {
            fs.readFile(FILE_TOKEN, { encoding: 'utf8' }, function read(err, data) {

                if (!data) {
                    let options: vscode.InputBoxOptions = {
                        placeHolder: "Enter Github Personal Access Token",
                        password: false,
                        prompt: "Link is opened to get the github token"
                    };
                    openurl("https://github.com/settings/tokens");
                    vscode.window.showInputBox(options).then((value) => {
                        if (value) {
                            value = value.trim();
                            fs.writeFile(FILE_TOKEN, value, function(err, data) {
                                if (err) {
                                    vscode.window.showErrorMessage("ERROR ! See detail on console.");
                                    console.log(err);
                                    return false;
                                }
                                TOKEN = value;
                                InitGist("token");
                                SetGIST();
                            });
                        }
                    });
                }
                else {
                    TOKEN = data;
                    InitGist("token");
                    SetGIST();
                }
            });
        };


        function SetGIST() {
            fs.readFile(FILE_GIST, { encoding: 'utf8' }, function read(err, data) {

                if (!data) {
                    let options: vscode.InputBoxOptions = {
                        placeHolder: "Enter GIST ID",
                        password: false,
                        prompt: "If you never upload the files in any machine before then upload it before."
                    };
                    vscode.window.showInputBox(options).then((value) => {
                        if (value) {
                            value = value.trim();
                            fs.writeFile(FILE_GIST, value, function(err, data) {
                                if (err) {
                                    vscode.window.showErrorMessage("ERROR ! See detail on console.");
                                    console.log(err);
                                    return false;
                                }
                                GIST = value;
                                InitGist("gist");
                            });
                        }
                    });
                }
                else {
                    GIST = data;
                    InitGist("gist");

                }
            });
        }



        function InitGist(type) {
            switch (type) {
                case "token": {
                    tokenChecked = true;
                    break;
                }
                case "gist": {
                    gistChecked = true;
                    break;
                }
            }
            if ((gistChecked) && (tokenChecked)) {
                vscode.window.setStatusBarMessage("Downloading Your Settings In Github.", 2000);
                StartDownload();
            }

        }

        function StartDownload() {
            github.getGistsApi().get({ id: GIST }, function(er, res) {


                var keys = Object.keys(res.files);
                for (var i: number = 0; i < keys.length; i++) {
                    switch (keys[i]) {
                        case "launch": {
                            fs.writeFile(FILE_LAUNCH, res.files.launch.content, function(err, data) {
                                if (err) {
                                    vscode.window.showErrorMessage("ERROR ! See detail on console.");
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
                                    vscode.window.showErrorMessage("ERROR ! See detail on console.");
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
                                    vscode.window.showErrorMessage("ERROR ! See detail on console.");
                                    console.log(err);
                                    return false;
                                }
                                vscode.window.showInformationMessage("Keybinding Settings downloaded Successfully");
                                //console.log("keybindings");
                                //console.log(data);
                            });
                            break;
                        }
                        default: {
                            if (!fs.existsSync(FOLDER_SNIPPETS)) {
                                fs.mkdirSync(FOLDER_SNIPPETS);
                            }
                            var file = FOLDER_SNIPPETS.concat(keys[i]).concat(".json");
                            fs.writeFile(file, res.files[keys[i]].content, function(err, data) {
                                if (err) {
                                    vscode.window.showErrorMessage("ERROR ! See detail on console.");
                                    console.log(err);
                                    return false;
                                }
                                //vscode.window.showInformationMessage(keys[i] +" snippets downloaded Successfully");
                                //console.log("keybindings");
                                //console.log(data);
                            });
                            break;
                        }

                    }
                }






            });
        }

        InitalizeTokenandGIST();

    });

    var disposable = vscode.commands.registerCommand('extension.resetSettings', () => {
        vscode.window.setStatusBarMessage("Resetting Your Sync Settings.", 2000);
        try {
            if (fs.existsSync(FILE_GIST)) {
                fs.unlinkSync(FILE_GIST);
            }
            if (fs.existsSync(FILE_TOKEN)) {
                fs.unlinkSync(FILE_TOKEN);
            }
            vscode.window.showInformationMessage("Sync Settings Cleared.");
        }
        catch (err) {
            console.log(err);
            vscode.window.showErrorMessage("Unable to clear settings. Error Logged on console.");
        }


    });

    context.subscriptions.push(disposable);
}