
export interface ITask {
    Create() : Promise<string>
    Upload() : Promise<boolean>;
    Download () : Promise<boolean>;
    Reset () : Promise<boolean>;
    Save() : Promise<boolean>;
}