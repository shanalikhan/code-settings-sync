import { ITask } from './ITask';

export class GitHubTasks implements ITask {

    constructor(private TOKEN : string){

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