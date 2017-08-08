
export interface ITask {
    Create(input : string) : Promise<string>
    Upload() : Promise<boolean>;
    Download () : Promise<boolean>;
    Reset () : Promise<boolean>;
    Save() : Promise<boolean>;
}