import { ITask } from './ITask';
import { TaskType, OsType, SettingType } from '../common/enums'
import { LocalConfig } from '../models/localConfig'
import { ExtensionConfig } from '../models/extensionConfig'
import { CustomSetting } from '../models/customSetting'
import { CloudSetting } from '../models/cloudSetting'
import {Environment} from '../common/environmentPath'
import * as vscode from 'vscode';
import {FileTasks} from './FileTasks';
import {GitHubTasks} from './GitHubTasks';

export class TaskFactory {

    private static context : vscode.ExtensionContext = null;
    private static config : LocalConfig = null;
    private static en : Environment = null;
    static CreateTask(config: LocalConfig, context: vscode.ExtensionContext, en : Environment ): ITask {
        this.context = context;
        this.config = config;
        this.en = en;
        return this.GetTask();
    }

    static GetTask(): ITask {
        let task : ITask = null;
        if(this.config.customConfig.type==TaskType.File){
            return new GitHubTasks(this.en,this.context);
        }
        else{

        }
        return task;
    }
}