"use strict";

import { LocalConfig } from "../setting";
import { File } from "./fileService";
import { ExtensionInformation } from "./pluginService";

export class UploadResponse {
  constructor(public uploadID: string, public updatedFiles: File[]) {}
}

export class DownloadResponse {
  constructor(
    public updatedFiles: File[],
    public addedExtensions: ExtensionInformation[],
    public deletedExtensions: ExtensionInformation[]
  ) {}
}

export interface ISyncService {
  connect(token: string, baseUrl: string): Promise<boolean>;
  upload(dateNow: Date, localConfig: LocalConfig): Promise<UploadResponse>;
  download(localConfig: LocalConfig): Promise<DownloadResponse>;
}
