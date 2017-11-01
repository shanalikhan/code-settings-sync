import * as vscode from 'vscode';
import { KeyValue} from '../models/keyvalue';

export interface ITask {
    Create(input : Array<KeyValue<string>>) : Promise<string>
    Upload(input : Array<KeyValue<any>>) : Promise<boolean>;
    Download (input : Array<KeyValue<any>>) : Promise<boolean>;
    Reset (input : Array<KeyValue<string>>) : Promise<boolean>;
    Save(input : Array<KeyValue<string>>) : Promise<boolean>;
    Close(): void;
}