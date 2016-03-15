"use strict";

import * as envir from './environmentPath';
import * as fileManager from './fileManager';


var GitHubApi = require("github");

var github = new GitHubApi({
    version: "3.0.0"
});


export class GithubService {

    private GIST_JSON_EMPTY: any = {
        "description": "Visual Studio code settings",
        "public": false,
        "files": {
            "settings.json": {
                "content": ""
            },
            "launch.json": {
                "content": ""
            },
            "keybindings.json": {
                "content": ""
            },
            "extensions.json": {
                "content": ""
            }

        }
    };
    private GIST_JSON: any = null;

    constructor(private TOKEN: string) {
        github.authenticate({
            type: "oauth",
            token: TOKEN
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

    public CreateNewGist(settingstext: string, launchtext: string, keybindingtext: string, extensiontext: string, snippetsFiles: Array<fileManager.File>): Promise<string> {

        var me = this;
        return new Promise<string>((resolve, reject) => {

            me.GIST_JSON_EMPTY.files["settings.json"].content = settingstext;
            me.GIST_JSON_EMPTY.files["launch.json"].content = launchtext;
            me.GIST_JSON_EMPTY.files["keybindings.json"].content = keybindingtext;
            me.GIST_JSON_EMPTY.files["extensions.json"].content = extensiontext;
            me.GIST_JSON_EMPTY = me.AddFile(snippetsFiles, me.GIST_JSON_EMPTY);

            github.getGistsApi().create(me.GIST_JSON_EMPTY
                , function(err, res) {
                    if (err) {
                        console.error(err);
                        reject(false);
                    }
                    resolve(res.id);
                   

                });
        });

    }

    public async ExistingGist(GIST: string, settingstext: string, launchtext: string, keybindingtext: string, extensiontext: string, snippetsFiles: Array<fileManager.File>): Promise<boolean> {
        var me = this;
        return new Promise<boolean>(async (resolve, reject) => {
            await github.getGistsApi().get({ id: GIST }, async function(er, res) {

                if (er) {
                    console.error(er);
                    reject(false);
                }
                else {

                    res.files["settings.json"].content = settingstext;
                    res.files["launch.json"].content = launchtext;
                    res.files["keybindings.json"].content = keybindingtext;
                    if (res.files["extensions.json"]) {
                        res.files["extensions.json"].content = extensiontext;
                    }
                    res = me.AddFile(snippetsFiles, res);
                    
                    await github.getGistsApi().edit(res, function(ere, ress) {
                        if (ere) {
                            console.error(er);
                            reject(false);
                        }
                        resolve(true);
                    });
                }
            });
        });
    }
    
    public async DownloadGist(gistID : string) : Promise<any>
    {
        return new Promise<any>(async(resolve,reject)=>{
            await  github.getGistsApi().get({ id: gistID }, function(er, res) {

                if (er) {
                    console.log(er);
                    reject(er);
                }
                resolve(res);
             });
        });
    }

}