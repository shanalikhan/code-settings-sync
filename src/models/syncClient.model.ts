export interface SyncFile {
  content: string;
}

export interface SyncDocument {
  data: {
    id?: string;
    owner?: { login: string };
    public?: boolean;
    files: { [name: string]: SyncFile };
  };
}

export interface SyncClient {
  userName: string;
  CreateEmptyGIST(isPublic: boolean, description: string): Promise<string>;
  ReadGist(id: string): Promise<SyncDocument>;
  IsGistNewer(id: string, lastDownload: Date): Promise<boolean>;
  UpdateGIST(
    document: SyncDocument,
    files: Array<{ gistName: string; content: string }>
  ): SyncDocument;
  SaveGIST(data: SyncDocument["data"]): Promise<boolean>;
}

export interface SyncHistory {
  lastUpload: Date;
  lastDownload: Date;
}
