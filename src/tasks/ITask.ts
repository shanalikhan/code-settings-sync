import * as vscode from 'vscode';

export interface ITask {
    Create(input : string,context :vscode.ExtensionContext ) : Promise<string>
    Upload() : Promise<boolean>;
    Download () : Promise<boolean>;
    Reset () : Promise<boolean>;
    Save() : Promise<boolean>;
}