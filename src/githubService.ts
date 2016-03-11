"use strict";
import * as vscode from 'vscode';
import * as pluginService from './pluginService';

import * as path from 'path';
import * as envir from './environmentPath';
import * as fileManager from './fileManager';
import * as commons from './commons';


var GitHubApi = require("github");

var github = new GitHubApi({
    version: "3.0.0"
});

export class File {
    public fileName : string = null;
    constructor(private file : string , public content : string, private filePath){
         this.fileName = file.split('.')[0];
    }
}

export class GithubService {
    private GIST_JSON: any = {
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
    constructor(private TOKEN){
          github.authenticate({
                type: "oauth",
                token: TOKEN
            });
    }
    
    public AddFile(list : Array<File>){
        var me = this;
        list.forEach(fil => {
           me.GIST_JSON.files[fil.fileName] = {};
           me.GIST_JSON.files[fil.fileName].content = fil.content;
        });
    }
}