export interface ISyncService {
  UploadSettings(): Promise<void>;
  DownloadSettings(): Promise<void>;
  IsConfigured(): Promise<boolean>;
}
