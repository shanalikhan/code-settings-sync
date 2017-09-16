import { ITask } from './ITask';
import {Environment} from '../common/environmentPath'
import * as vscode from 'vscode';
import {Commons} from '../common/commons'


export class FileTasks implements ITask {
    private com : Commons = null;
    
    constructor(private en : Environment,context :vscode.ExtensionContext){
        this.en = new Environment(context);
        this.com = new Commons(this.en,context);
    }
    Create(): Promise<string> {
        throw new Error("Method not implemented.");
    }

    Save(): Promise<boolean> {
        throw new Error("Method not implemented.");
    }
    Upload(): Promise<boolean> {
        return null;
    }

    Download(): Promise<boolean> {
        return null;
    }
    Reset(): Promise<boolean> {
        return null;
    }


}