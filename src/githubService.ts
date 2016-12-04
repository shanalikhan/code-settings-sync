"use strict";

import * as envir from './environmentPath';
import * as fileManager from './fileManager';
import * as vscode from 'vscode';

var proxyURL: string = vscode.workspace.getConfiguration("http")["proxy"] || process.env["http_proxy"];
var GitHubApi = require("github");
var github = new GitHubApi({
    proxy: proxyURL,
    version: "3.0.0",
});

export class GithubService {

    private GIST_JSON_EMPTY: any = {
        "description": "Visual Studio Code Sync Settings GIST",
        "public": false,
        "files": {
            "settings.json": {
                "content": "// Empty"
            },
            "launch.json": {
                "content": "// Empty"
            },
            "keybindings.json": {
                "content": "// Empty"
            },
            "extensions.json": {
                "content": "// Empty"
            },
            "locale.json": {
                "content": "// Empty"
            },
            "keybindingsMac.json": {
                "content": "// Empty"
            },
            "cloudSettings": {
                "content": "// Empty"
            }
        }
    };
    public userName : string = null;
    public name : string = null;

    private GIST_JSON: any = null;
    
    constructor(private TOKEN: string) {
        var self : GithubService = this;
        github.authenticate({
            type: "oauth",
            token: TOKEN
        });

        github.users.get({}, function(err, res) {
            if(err){
                console.log(err);
            }
            else{
                self.userName = res.login;
                self.name = res.name;
            }
        });
    }

    public AddFile(list: Array<fileManager.File>, GIST_JSON_b: any) {
        for (var i = 0; i < list.length; i++) {
            var file = list[i];
            GIST_JSON_b.files[file.fileName] = {};
            GIST_JSON_b.files[file.fileName].content = file.content;
        }
        return GIST_JSON_b;
    }

    public CreateEmptyGIST(publicGist: boolean): Promise<string> {
        var me = this;
        if (publicGist) {
            me.GIST_JSON_EMPTY.public = true;
        }
        else {
            me.GIST_JSON_EMPTY.public = false;
        }

        return new Promise<string>((resolve, reject) => {
            github.getGistsApi().create(me.GIST_JSON_EMPTY
                , function (err, res) {
                    if (err) {
                        console.error(err);
                        reject(false);
                    }
                    if (res.id) {
                        resolve(res.id);
                    } else {
                        console.error("ID is null");
                        console.log("Sync : "+"Response from GitHub is: ");
                        console.log(res);
                    }

                });
        });
    }

    public async ReadGist(GIST: string): Promise<any> {
        var me = this;
        return new Promise<any>(async (resolve, reject) => {
            await github.getGistsApi().get({ id: GIST }, async function (er, res) {
                if (er) {
                    console.error(er);
                    reject(er);
                }
                resolve(res);
            });
        });
    }

    public UpdateGIST(gistObject: any, files: Array<fileManager.File>): any {

        var me = this;
        var allFiles: string[] = Object.keys(gistObject.files);
        for (var fileIndex = 0; fileIndex < allFiles.length; fileIndex++) {
            var fileName = allFiles[fileIndex];

            var exists = false;

            files.forEach((settingFile) => {
                if (settingFile.fileName == fileName) {
                    exists = true;
                }
            });

            if (!exists && !fileName.startsWith("keybindings")) {
                gistObject.files[fileName] = null;
            }

        }

        gistObject = me.AddFile(files, gistObject);
        return gistObject;
    }

    public async SaveGIST(gistObject: any): Promise<boolean> {
        var me = this;

        //TODO : turn diagnostic mode on for console.
        return new Promise<boolean>(async (resolve, reject) => {
            await github.getGistsApi().edit(gistObject, function (ere, ress) {
                if (ere) {
                    console.error(ere);
                    reject(false);
                }
                resolve(true);
            });
        });
    }
}