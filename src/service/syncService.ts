"use strict";

import { LocalConfig } from "../setting";
import { File } from "./fileService";
import { ExtensionInformation } from "./pluginService";

export interface IUploadResponse {
  uploadID: string;
  updatedFiles: File[];
}

export interface IDownloadResponse {
  updatedFiles: File[];
  addedExtensions: ExtensionInformation[];
  deletedExtensions: ExtensionInformation[];
}

export interface ISyncService {
  connect(token: string, baseUrl: string): Promise<boolean>;
  upload(dateNow: Date, localConfig: LocalConfig): Promise<IUploadResponse>;
  download(localConfig: LocalConfig): Promise<IDownloadResponse>;
}
