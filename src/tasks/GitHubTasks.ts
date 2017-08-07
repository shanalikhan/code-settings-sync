import { ITask } from './ITask';
import {GitHubService} from '../services/githubService'
import * as vscode from 'vscode';
import {Environment} from '../common/environmentPath'
import {Commons} from '../common/commons'


export class GitHubTasks implements ITask {

    private gitService : GitHubService = null;
    private en : Environment = null;
    private com : Commons = null;

    constructor(private TOKEN : string, private context :vscode.ExtensionContext ){
        this.gitService = new GitHubService(TOKEN);
        this.en = new Environment(this.context);
        this.com = new Commons(this.en,this.context);
    }
    Create(): Promise<string> {
        var self = this;
        return new Promise<string>((resolve,reject)=>{
            if(self.TOKEN==""){
                reject("Sync : Set GitHub Token or set anonymousGist to true from settings.");
            }
            
        });
        //throw new Error("Method not implemented.");
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