import { IInputOption } from "./IInputOption";
import { LocalConfig } from "../models/localConfig";
import * as vscode from 'vscode';

const openurl = require('opn');



export class GitHubGistOption implements IInputOption {

    constructor(private config: LocalConfig) {

    }

    private readonly TOKEN_OPTIONS: vscode.InputBoxOptions = {
        placeHolder: "Enter GitHub Personal Access Token",
        password: false,
        prompt: "Link opened to get the GitHub token. Enter token and press [Enter] or press / type 'esc' to cancel.",
        ignoreFocusOut: true
    };

    private readonly GIST_OPTIONS: vscode.InputBoxOptions = {
        placeHolder: "Enter Gist Id",
        password: false,
        prompt: "Enter Gist Id from previously uploaded settings and press [Enter] or press / type 'esc' to cancel.",
        ignoreFocusOut: true
    };

    getSetting(): Promise<LocalConfig> {

        return new Promise<LocalConfig>((resolve, reject) => {
            if (this.config.customConfig.gistSettings.token == "") {
                if (this.config.extConfig.anonymousGist == true) {

                }
            }
        });

    }
    setSetting(setting: LocalConfig): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

}