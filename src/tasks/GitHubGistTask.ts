import { ITask } from './ITask';
import { GitHubService } from '../services/githubService'
import * as vscode from 'vscode';
import { Environment } from '../common/environmentPath'
import { Commons } from '../common/commons'
import { KeyValue } from '../models/keyvalue';


export class GitHubGistTask implements ITask {


    private gitService: GitHubService = null;
    private com: Commons = null;

    constructor(private en: Environment, context: vscode.ExtensionContext) {
        this.en = new Environment(context);
        this.com = new Commons(this.en, context);
        this.com.CloseWatch();
    }

    Create(input: Array<KeyValue<string>>): Promise<string> {
        var self = this;
        return new Promise<string>(async (resolve, reject) => {
            let anonymousGist: boolean = false;
            let gitService: GitHubService = null;
            let token: string = "";
            try {
                let description: string = "";
                let publicGist: boolean = false;
                if (input.filter(m => m.Key == "description").length > 0) {
                    description = input.filter(m => m.Key == "description")[0].Value;
                }

                publicGist = (input.filter(m => m.Key == "publicGist").length > 0) ? true : false;

                if (input.filter(m => m.Key == "anonymous").length > 0) {
                    anonymousGist = true;
                    gitService = new GitHubService("");

                } else {
                    token = input.filter(m => m.Key == "token")[0].Value;
                    gitService = new GitHubService(token);
                }

                let id: string = await gitService.CreateEmptyGIST(publicGist, description);
                resolve(id);
            } catch (error) {
                reject(error);
            }
        });
    }

    Save(input: Array<KeyValue<string>>): Promise<boolean> {
        throw new Error("Method not implemented.");
    }
    Upload(input: Array<KeyValue<string>>): Promise<boolean> {
        return null;
    }

    Download(input: Array<KeyValue<string>>): Promise<boolean> {
        return null;
    }
    Reset(input: Array<KeyValue<string>>): Promise<boolean> {
        return null;
    }
    Close(): void {
        this.com.StartWatch();
    }

}