export interface ISyncService {
  Export(optArgument?: any[]): Promise<void>;
  Import(optArgument?: any[]): Promise<void>;
  IsConfigured(optArgument?: any[]): Promise<boolean>;
  Reset(optArgument?: any[]): Promise<void>;
}
