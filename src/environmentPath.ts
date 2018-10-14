"use strict";

import { exec } from "child_process";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { OsType } from "./enums";

export const SUPPORTED_OS: string[] = Object.keys(OsType)
  .filter(k => !/\d/.test(k))
  .map(k => k.toLowerCase()); // . ["windows", "linux", "mac"];

export function osTypeFromString(osName: string): OsType {
  const capitalized: string =
    osName[0].toUpperCase() + osName.substr(1).toLowerCase();
  return OsType[capitalized];
}

export class Environment {
  public static CURRENT_VERSION: number = 320;
  public static getVersion(): string {
    return (
      Environment.CURRENT_VERSION.toString().slice(0, 1) +
      "." +
      Environment.CURRENT_VERSION.toString().slice(1, 2) +
      "." +
      Environment.CURRENT_VERSION.toString().slice(2, 3)
    );
  }

  public isInsiders: boolean = false;
  public isOss: boolean = false;
  public isPortable : boolean = false;
  public homeDir: string | null = null;
  public USER_FOLDER : string = null;

  public ExtensionFolder: string = null;
  public PATH: string = null;
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

  constructor(private context: vscode.ExtensionContext) {
    this.isInsiders = /insiders/.test(this.context.asAbsolutePath(""));
    this.isPortable = process.env.VSCODE_PORTABLE ? true : false;
    this.isOss = /\boss\b/.test(this.context.asAbsolutePath(""));
    const isXdg =
      !this.isInsiders &&
      process.platform === "linux" &&
      !!process.env.XDG_DATA_HOME;
    this.homeDir = isXdg
      ? process.env.XDG_DATA_HOME
      : process.env[process.platform === "win32" ? "USERPROFILE" : "HOME"];
    const configSuffix = `${isXdg ? "" : "."}vscode${
      this.isInsiders ? "-insiders" : this.isOss ? "-oss" : ""
    }`;
    
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    this.PATH = process.env.APPDATA;
    this.OsType = OsType.Windows;

    if (!this.PATH && !this.isPortable) {
      if (process.platform === "darwin") {
        this.PATH = process.env.HOME + "/Library/Application Support";
        this.OsType = OsType.Mac;
      } else if (process.platform === "linux") {
        this.PATH =
          isXdg && !!process.env.XDG_CONFIG_HOME
            ? process.env.XDG_CONFIG_HOME
            : os.homedir() + "/.config";
        this.OsType = OsType.Linux;
      } else {
        this.PATH = "/var/local";
        this.OsType = OsType.Linux;
      }
    }

    if (!this.PATH && this.isPortable) {
      if (process.platform === "darwin") {
        this.PATH = process.env.HOME + "/Library/Application Support";
        this.OsType = OsType.Mac;
      } else if (process.platform === "linux") {
        this.PATH = process.env.VSCODE_PORTABLE;
        this.OsType = OsType.Linux;
      } else {
        this.PATH = process.env.VSCODE_PORTABLE;
        this.OsType = OsType.Linux;
      }
    }

    if (this.OsType === OsType.Linux) {
      const myExt =
        "chmod +x " +
        this.ExtensionFolder +
        "/Shan.code-settings-sync-" +
        Environment.getVersion() +
        "/node_modules/opn/xdg-open";
      exec(myExt, () => {
        // command output is in stdout
      });
    }
    if(!this.isPortable){
      const possibleCodePaths = [];
      if (this.isInsiders) {
        possibleCodePaths.push("/Code - Insiders");
      } else if (this.isOss) {
        possibleCodePaths.push("/Code - OSS");
        possibleCodePaths.push("/VSCodium");
      } else {
        possibleCodePaths.push("/Code");
      }
      for (const possibleCodePath of possibleCodePaths) {
        try {
          fs.statSync(this.PATH + possibleCodePath);
          this.PATH = this.PATH + possibleCodePath;
          break;
        } catch (e) {
          console.error("Error :" + possibleCodePath);
          console.error(e);
        }
      }
      this.ExtensionFolder = path.join(this.homeDir, configSuffix, "extensions");
      this.USER_FOLDER = this.PATH.concat("/User/");
      
    }
    else{
      this.USER_FOLDER = this.PATH.concat("/user-data/User/");
      this.ExtensionFolder = this.PATH.concat("/extensions/")
    }
    
    this.FILE_EXTENSION = this.USER_FOLDER.concat(this.FILE_EXTENSION_NAME);
    this.FILE_SETTING = this.USER_FOLDER.concat(this.FILE_SETTING_NAME);
    this.FILE_LAUNCH = this.USER_FOLDER.concat(this.FILE_LAUNCH_NAME);
    this.FILE_KEYBINDING = this.USER_FOLDER.concat(this.FILE_KEYBINDING_NAME);
    this.FILE_LOCALE = this.USER_FOLDER.concat(this.FILE_LOCALE_NAME);
    this.FOLDER_SNIPPETS = this.USER_FOLDER.concat("/snippets/");
    this.FILE_CLOUDSETTINGS = this.USER_FOLDER.concat(this.FILE_CLOUDSETTINGS_NAME);
    this.FILE_CUSTOMIZEDSETTINGS = this.USER_FOLDER.concat(this.FILE_CUSTOMIZEDSETTINGS_NAME);
    this.FILE_SYNC_LOCK = this.USER_FOLDER.concat(this.FILE_SYNC_LOCK_NAME);
  }
}
