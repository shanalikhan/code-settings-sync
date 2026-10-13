import { CustomConfig } from "../models/customConfig.model";
import { File } from "./file.service";

// Preserve the established file payload while allowing a second storage backend.
export interface ISettingsStorage {
  userName: string;
  CreateEmptyGIST(isPublic: boolean, description: string): Promise<string>;
  ReadGist(id: string): Promise<any>;
  IsGistNewer(id: string, lastDownload: Date): Promise<boolean>;
  UpdateGIST(payload: any, files: File[]): any;
  SaveGIST(payload: any): Promise<boolean>;
}

export function syncHistory(settings: CustomConfig) {
  return settings.syncMethod === "GitRepository"
    ? settings.repositorySettings
    : settings.githubSettings.gistSettings;
}
