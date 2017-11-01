import { ITask } from './ITask';
import { TaskType, OsType, SettingType } from '../common/enums';
import { LocalConfig } from '../models/localConfig';
import { ExtensionConfig } from '../models/extensionConfig';
import { CustomSetting } from '../models/customSetting';
import { KeyValue} from '../models/keyvalue';
import { CloudSetting } from '../models/cloudSetting';
import {Environment} from '../common/environmentPath';
import {Commons} from "../common/commons";
import * as vscode from 'vscode';
import {FileTasks} from './FileTasks';
import {GitHubGistTask} from './GitHubGistTask';

export class TaskFactory {

    private static context : vscode.ExtensionContext = null;
    private static config : LocalConfig = null;
    private static en : Environment = null;
    private static com : Commons = null;
    public static async CreateTask(en : Environment, com : Commons): Promise<ITask> {
        this.en = en;
        this.com = com;
        //this.config = this.com.InitalizeSettings();
        return this.GetTask();
    }

    public static async GetTask(): Promise<ITask> {
        let task : ITask = null;
        if(this.config.customConfig.type==TaskType.GitHubGist){
            //this.config = await this.com.InitalizeSettings(true,false);
            this.config.publicGist = false;

            return new GitHubGistTask(this.en,this.context);
        }
        else{
            //TODO: Work on File
            //this.com.InitalizeSettings(false,false); 
            return null;
        }
    }
}