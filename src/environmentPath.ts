"use strict";
import * as vscode from 'vscode';
import * as path from 'path';
import { OsType } from './enums';

export class Environment {

    public static CURRENT_VERSION: number = 261;
    public static getVersion(): string {
        var txt2 = Environment.CURRENT_VERSION.toString().slice(0, 1) + "." + Environment.CURRENT_VERSION.toString().slice(1, 2) + "." + Environment.CURRENT_VERSION.toString().slice(2, 3);
        return txt2;
    }

    private context: vscode.ExtensionContext;
    public isInsiders = null;
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

    public FILE_CUSTOMIZEDSETTINGS_NAME: string = "syncLocalSettings.json";
    public FILE_CUSTOMIZEDSETTINGS: string = null;

    public FILE_SETTING_NAME: string = "settings.json";
    public FILE_LAUNCH_NAME: string = "launch.json";
    public FILE_KEYBINDING_NAME: string = "keybindings.json";
    public FILE_KEYBINDING_MAC: string = "keybindingsMac.json";
    public FILE_KEYBINDING_DEFAULT: string = "keybindings.json";
    public FILE_EXTENSION_NAME: string = "extensions.json";
    public FILE_LOCALE_NAME: string = "locale.json";

    public FILE_CLOUDSETTINGS_NAME: string = "cloudSettings";
    public FILE_LOCATIONSETTINGS_NAME: string = "syncSettings.json";

    public FOLDER_SNIPPETS: string = null;
    public APP_SETTINGS: string = null;
    public APP_SUMMARY_NAME: string = "syncSummary.txt";
    public APP_SUMMARY: string = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.isInsiders = /insiders/.test(context.asAbsolutePath(""));
        this.homeDir = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
        this.ExtensionFolder = path.join(this.homeDir, this.isInsiders ? '.vscode-insiders' : '.vscode', 'extensions');
        var os = require("os");
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
                var os = require("os");
                this.PATH = os.homedir() + '/.config';
                this.OsType = OsType.Linux;
            } else {
                this.PATH = '/var/local';
                this.OsType = OsType.Linux;
            }
        }

        var codePath = this.isInsiders ? '/Code - Insiders' : '/Code';
        this.PATH = this.PATH + codePath;
        this.USER_FOLDER = this.PATH.concat("/User/");

        this.FILE_EXTENSION = this.PATH.concat("/User/", this.FILE_EXTENSION_NAME);
        this.FILE_SETTING = this.PATH.concat("/User/", this.FILE_SETTING_NAME);
        this.FILE_LAUNCH = this.PATH.concat("/User/", this.FILE_LAUNCH_NAME);
        this.FILE_KEYBINDING = this.PATH.concat("/User/", this.FILE_KEYBINDING_NAME);
        this.FILE_LOCALE = this.PATH.concat("/User/", this.FILE_LOCALE_NAME);
        this.FOLDER_SNIPPETS = this.PATH.concat("/User/snippets/");
        this.APP_SETTINGS = this.PATH.concat("/User/", this.FILE_LOCATIONSETTINGS_NAME);
        this.APP_SUMMARY = this.PATH.concat("/User/", this.APP_SUMMARY_NAME);
        this.FILE_CLOUDSETTINGS = this.PATH.concat("/User/", this.FILE_CLOUDSETTINGS_NAME);
        this.FILE_CUSTOMIZEDSETTINGS = this.PATH.concat("/User/", this.FILE_CUSTOMIZEDSETTINGS_NAME);

    }


}
