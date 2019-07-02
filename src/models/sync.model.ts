export interface ISyncService {
  id: string;
  UploadSettings(): Promise<void>;
  DownloadSettings(): Promise<void>;
  IsConfigured(): Promise<boolean>;
}
