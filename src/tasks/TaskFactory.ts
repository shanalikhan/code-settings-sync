import { ITask } from './ITask';
import { TaskType, OsType, SettingType } from '../common/enums'
import { LocalConfig } from '../models/localConfig'
import { ExtensionConfig } from '../models/extensionConfig'
import { CustomSetting } from '../models/customSetting'
import { CloudSetting } from '../models/cloudSetting'
import * as vscode from 'vscode';

export class TaskFactory {

    private static task: ITask = null;
    private static context : vscode.ExtensionContext = null;
    private static config : LocalConfig = null;

    static CreateTask(config: LocalConfig, context: vscode.ExtensionContext): ITask {
        this.context = context;
        this.config = config;
        return null;
    }

    static GetTask(): ITask {
        if (this.task == null) {
            throw new Error("Task Not Start. Create the Task First.");
        }
        return this.task;
    }
}