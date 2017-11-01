import { LocalConfig } from "../models/localConfig";

export interface IInputOption{
    getSetting() : Promise<LocalConfig>;
    setSetting(setting : LocalConfig) : Promise<boolean>; 
}