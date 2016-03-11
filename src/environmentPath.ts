"use strict";
import * as vscode from 'vscode';
import * as path from 'path';

export class Environment {

    private context: vscode.ExtensionContext;
    public isInsiders = null;
    public homeDir = null;
    public ExtensionFolder: string = null;
    public PATH = null;

    public FILE_GIST: string = null;
    public FILE_TOKEN: string = null;
    public FILE_SETTING: string = null;
    public FILE_LAUNCH: string = null;
    public FILE_KEYBINDING: string = null;
    public FOLDER_SNIPPETS: string = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.isInsiders = /insiders/.test(context.asAbsolutePath(""));
        this.homeDir = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
        this.ExtensionFolder = path.join(this.homeDir, this.isInsiders ? '.vscode-insiders' : '.vscode', 'extensions');

        this.PATH = process.env.APPDATA
        if (!this.PATH) {
            if (process.platform == 'darwin')
                this.PATH = process.env.HOME + '/Library/Application Support';
            else if (process.platform == 'linux') {
                var os = require("os")
                this.PATH = os.homedir() + '/.config';
            } else
                this.PATH = '/var/local'
        }

        var codePath = this.isInsiders ? '/Code - Insiders' : '/Code';
        this.PATH = this.PATH + codePath;

        this.FILE_GIST = this.PATH.concat("/User/gist_sync.txt");
        this.FILE_TOKEN = this.PATH.concat("/User/token.txt");
        this.FILE_SETTING = this.PATH.concat("/User/settings.json");
        this.FILE_LAUNCH = this.PATH.concat("/User/launch.json");
        this.FILE_KEYBINDING = this.PATH.concat("/User/keybindings.json");
        this.FOLDER_SNIPPETS = this.PATH.concat("/User/snippets/");
    }


}