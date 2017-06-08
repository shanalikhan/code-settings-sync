
export interface ITask {
    Upload() : Promise<boolean>;
    Download () : Promise<boolean>;
    Reset () : Promise<boolean>;
    Save() : Promise<boolean>;
}