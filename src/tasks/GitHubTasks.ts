import { ITask } from './ITask';
import {GitHubService} from '../services/githubService'
import * as vscode from 'vscode';
import {Environment} from '../common/environmentPath'
import {Commons} from '../common/commons'


export class GitHubTasks implements ITask {

    private gitService : GitHubService = null;
    private com : Commons = null;
    private token : string = null;
    
    constructor(private en : Environment,context :vscode.ExtensionContext){
        this.en = new Environment(context);
        this.com = new Commons(this.en,context);
    }

    Create(input : string): Promise<string> {
        var self = this;
        this.gitService = new GitHubService(input);
       

        return new Promise<string>((resolve,reject)=>{
            if(self.token){
                if(self.token=="ANON"){
                    
                }
            }
            if(self.token==""){
                //reject("Sync : Set GitHub Token or set anonymousGist to true from settings.");
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