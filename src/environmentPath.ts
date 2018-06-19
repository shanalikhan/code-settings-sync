"use strict";
import { OsType } from './enums';
import { statSync } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export class Environment {

    public static CURRENT_VERSION: number = 292;
    public static getVersion(): string {
        var txt2 = Environment.CURRENT_VERSION.toString().slice(0, 1) + "." + Environment.CURRENT_VERSION.toString().slice(1, 2) + "." + Environment.CURRENT_VERSION.toString().slice(2, 3);
        return txt2;
    }

    private context: vscode.ExtensionContext;
    public isInsiders = null;
    public isOss = null;
    public homeDir = null;
    public USER_FOLDER = null;

    public ExtensionFolder: string = null;
    public PATH = null;
    public OsType: OsType = null;

    public FILE_SETTING: string = null;
    public FILE_LAUNCH: string = null;
    public FILE_KEYBINDING: string = null;
    public FILE_LOCALE: string = null;
    public FILE_EXTENSION: string = null;
    public FILE_CLOUDSETTINGS: string = null;
    public FILE_SYNC_LOCK: string = null;

    public FILE_CUSTOMIZEDSETTINGS_NAME: string = "syncLocalSettings.json";
    public FILE_CUSTOMIZEDSETTINGS: string = null;

    public FILE_SETTING_NAME: string = "settings.json";
    public FILE_LAUNCH_NAME: string = "launch.json";
    public FILE_KEYBINDING_NAME: string = "keybindings.json";
    public FILE_KEYBINDING_MAC: string = "keybindingsMac.json";
    public FILE_KEYBINDING_DEFAULT: string = "keybindings.json";
    public FILE_EXTENSION_NAME: string = "extensions.json";
    public FILE_LOCALE_NAME: string = "locale.json";
    public FILE_SYNC_LOCK_NAME: string = "sync.lock";

    public FILE_CLOUDSETTINGS_NAME: string = "cloudSettings";

    public FOLDER_SNIPPETS: string = null;
    public APP_SUMMARY_NAME: string = "syncSummary.txt";
    public APP_SUMMARY: string = null;

    constructor(context: vscode.ExtensionContext) {
        var os = require("os");
        this.context = context;
        this.isInsiders = /insiders/.test(context.asAbsolutePath(""));
        this.isOss = /\boss\b/.test(context.asAbsolutePath(""));
        const isXdg = !this.isInsiders && !!this.isOss && process.platform === 'linux' && !!process.env.XDG_DATA_HOME
        this.homeDir =  isXdg
                ? process.env.XDG_DATA_HOME
                : process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
        const configSuffix = `${isXdg ? '' : '.'}vscode${this.isInsiders ? '-insiders' : this.isOss ? '-oss' : ''}`
        this.ExtensionFolder = path.join(this.homeDir, configSuffix, 'extensions');
        
        //console.log(os.type());

        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
        this.PATH = process.env.APPDATA;
        this.OsType = OsType.Windows;

        if (!this.PATH) {
            if (process.platform == 'darwin') {
                this.PATH = process.env.HOME + '/Library/Application Support';
                this.OsType = OsType.Mac;
            }
            else if (process.platform == 'linux') {
                this.PATH = isXdg && !!process.env.XDG_CONFIG_HOME ? process.env.XDG_CONFIG_HOME : os.homedir() + '/.config';
                this.OsType = OsType.Linux;
            } else {
                this.PATH = '/var/local';
                this.OsType = OsType.Linux;
            }
        }

        if(this.OsType == OsType.Linux){
            let myExt = "chmod +x " + this.ExtensionFolder+"/Shan.code-settings-sync-"+ Environment.getVersion()+"/node_modules/opn/xdg-open";
            var exec = require('child_process').exec;
            exec(myExt, function(error, stdout, stderr) {
               //debugger;
                // command output is in stdout
            });
        }

        const possibleCodePaths = [this.isInsiders ? '/Code - Insiders' : this.isOss ? '/Code - OSS' : '/Code'];
        for (const _path of possibleCodePaths) {
            try {
                fs.statSync(this.PATH + _path);
                this.PATH = this.PATH + _path;
                break;
            } catch(e) {
                console.error("Error :"+ _path);
                console.error(e);
            }
        }
        this.USER_FOLDER = this.PATH.concat("/User/");

        this.FILE_EXTENSION = this.PATH.concat("/User/", this.FILE_EXTENSION_NAME);
        this.FILE_SETTING = this.PATH.concat("/User/", this.FILE_SETTING_NAME);
        this.FILE_LAUNCH = this.PATH.concat("/User/", this.FILE_LAUNCH_NAME);
        this.FILE_KEYBINDING = this.PATH.concat("/User/", this.FILE_KEYBINDING_NAME);
        this.FILE_LOCALE = this.PATH.concat("/User/", this.FILE_LOCALE_NAME);
        this.FOLDER_SNIPPETS = this.PATH.concat("/User/snippets/");
        this.APP_SUMMARY = this.PATH.concat("/User/", this.APP_SUMMARY_NAME);
        this.FILE_CLOUDSETTINGS = this.PATH.concat("/User/", this.FILE_CLOUDSETTINGS_NAME);
        this.FILE_CUSTOMIZEDSETTINGS = this.PATH.concat("/User/", this.FILE_CUSTOMIZEDSETTINGS_NAME);
        this.FILE_SYNC_LOCK = this.PATH.concat("/User/", this.FILE_SYNC_LOCK_NAME);

    }


}
