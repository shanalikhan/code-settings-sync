"use strict";

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
  public static CURRENT_VERSION: number = 329;
  public static getVersion(): string {
    return (
      Environment.CURRENT_VERSION.toString().slice(0, 1) +
      "." +
      Environment.CURRENT_VERSION.toString().slice(1, 2) +
      "." +
      Environment.CURRENT_VERSION.toString().slice(2, 3)
    );
  }

  public isPortable: boolean = false;
  public homeDir: string | null = null;
  public USER_FOLDER: string = null;

  public EXTENSION_FOLDER: string = null;
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
    this.context.globalState.update("_", undefined); // Make sure the global state folder exists. This is needed for using this.context.globalStoragePath to access user folder

    this.isPortable = !!process.env.VSCODE_PORTABLE;

    if (!this.isPortable) {
      this.PATH = path
        .resolve(this.context.globalStoragePath, "../../..")
        .concat("/");
      this.USER_FOLDER = path.resolve(this.PATH, "User").concat("/");
      this.EXTENSION_FOLDER = path
        .resolve(vscode.extensions.all[72].extensionPath, "..")
        .concat("/"); // 0-71 are vscode built-in extensions that are in a separate folder. 72 is the first user-installed extension
    }

    if (this.isPortable) {
      this.PATH = process.env.VSCODE_PORTABLE;
      this.USER_FOLDER = path.resolve(this.PATH, "user-data/User").concat("/");
      this.EXTENSION_FOLDER = path.resolve(this.PATH, "extensions").concat("/");
    }

    this.OsType = process.platform as OsType;

    this.FILE_EXTENSION = this.USER_FOLDER.concat(this.FILE_EXTENSION_NAME);
    this.FILE_SETTING = this.USER_FOLDER.concat(this.FILE_SETTING_NAME);
    this.FILE_LAUNCH = this.USER_FOLDER.concat(this.FILE_LAUNCH_NAME);
    this.FILE_KEYBINDING = this.USER_FOLDER.concat(this.FILE_KEYBINDING_NAME);
    this.FILE_LOCALE = this.USER_FOLDER.concat(this.FILE_LOCALE_NAME);
    this.FOLDER_SNIPPETS = this.USER_FOLDER.concat("/snippets/");
    this.FILE_CLOUDSETTINGS = this.USER_FOLDER.concat(
      this.FILE_CLOUDSETTINGS_NAME
    );
    this.FILE_CUSTOMIZEDSETTINGS = this.USER_FOLDER.concat(
      this.FILE_CUSTOMIZEDSETTINGS_NAME
    );
    this.FILE_SYNC_LOCK = this.USER_FOLDER.concat(this.FILE_SYNC_LOCK_NAME);
  }
}
