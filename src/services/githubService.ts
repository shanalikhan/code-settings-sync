"use strict";

import { File } from '../manager/fileManager';
import * as vscode from 'vscode';
import { Environment } from '../common/environmentPath';

var proxyURL: string = vscode.workspace.getConfiguration("http")["proxy"] || process.env["http_proxy"];
var host: string = vscode.workspace.getConfiguration("sync")["host"];
var pathPrefix: string = vscode.workspace.getConfiguration("sync")["pathPrefix"];
if (!host || host === "") {
    host = "api.github.com";
    pathPrefix = "";
}
var GitHubApi = require("github");
var github = new GitHubApi({
    proxy: proxyURL,
    version: "3.0.0",
    host: host,
    pathPrefix: pathPrefix,
    rejectUnauthorized: false
});

export class GitHubService {

    private GIST_JSON_EMPTY: any = {
        "description": "Visual Studio Code Sync Settings Gist",
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
    public userName: string = null;
    public name: string = null;

    private GIST_JSON: any = null;

    constructor(private TOKEN: string) {
        if (TOKEN != null && TOKEN != '') {
            try {
                var self: GitHubService = this;
                github.authenticate({
                    type: "oauth",
                    token: TOKEN
                });
            } catch (error) {

            }

            github.users.get({}, function (err, res) {
                if (err) {
                    console.log(err);
                }
                else {
                    self.userName = res.data.login;
                    self.name = res.data.name;
                    console.log("Sync : Connected with user : " + "'" + self.userName + "'");
                }
            });
        }
    }

    public AddFile(list: Array<File>, GIST_JSON_b: any) {
        for (var i = 0; i < list.length; i++) {
            var file = list[i];
            if (file.content != '') {
                GIST_JSON_b.files[file.gistName] = {};
                GIST_JSON_b.files[file.gistName].content = file.content;
            }
        }
        return GIST_JSON_b;
    }

    public CreateEmptyGIST(publicGist: boolean, gistDesciption: string): Promise<string> {
        var me = this;
        if (publicGist) {
            me.GIST_JSON_EMPTY.public = true;
        }
        else {
            me.GIST_JSON_EMPTY.public = false;
        }
        if (gistDesciption != null && gistDesciption != "") {
            me.GIST_JSON_EMPTY.description = gistDesciption;
        }

        return new Promise<string>((resolve, reject) => {
            github.getGistsApi().create(me.GIST_JSON_EMPTY
                , function (err, res) {
                    if (err) {
                        console.error(err);
                        reject(err);
                    }
                    else {
                        if (res.data.id) {
                            resolve(res.data.id);
                        } else {
                            console.error("ID is null");
                            console.log("Sync : " + "Response from GitHub is: ");
                            console.log(res);
                        }
                    }
                });
        });
    }

    public async CreateAnonymousGist(publicGist: boolean, files: Array<File>, gistDesciption: string): Promise<any> {
        var me = this;
        if (publicGist) {
            me.GIST_JSON_EMPTY.public = true;
        }
        else {
            me.GIST_JSON_EMPTY.public = false;
        }
        if (gistDesciption != null && gistDesciption != "") {
            me.GIST_JSON_EMPTY.description = gistDesciption;
        }

        let gist: any = me.AddFile(files, me.GIST_JSON_EMPTY);

        return new Promise<string>((resolve, reject) => {
            github.getGistsApi().create(gist
                , function (err, res) {
                    if (err) {
                        console.error(err);
                        reject(err);
                    }
                    if (res.data.id) {
                        resolve(res.data.id);
                    } else {
                        console.error("ID is null");
                        console.log("Sync : " + "Response from GitHub is: ");
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

    public UpdateGIST(gistObject: any, files: Array<File>): any {

        var me = this;
        var allFiles: string[] = Object.keys(gistObject.data.files);
        for (var fileIndex = 0; fileIndex < allFiles.length; fileIndex++) {
            var fileName = allFiles[fileIndex];

            var exists = false;

            files.forEach((settingFile) => {
                if (settingFile.gistName == fileName) {
                    exists = true;
                }
            });

            if (!exists && !fileName.startsWith("keybindings")) {
                gistObject.data.files[fileName] = null;
            }

        }

        gistObject.data = me.AddFile(files, gistObject.data);
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
