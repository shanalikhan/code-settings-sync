
"use strict";

import { File } from "./fileService";
import { Environment } from "../environmentPath";
import Commons from "../commons";
import { LocalConfig } from "../setting";
import { ExtensionInformation } from "./pluginService";

export class DownloadResponse {
  constructor(
    public updatedFiles: File[],
    public addedExtensions: ExtensionInformation[],
    public deletedExtensions: ExtensionInformation[],
  ){}
}

export interface ISyncService {
  upload(
    allSettingFiles: File[],
    dateNow: Date,
    env: Environment,
    localConfig: LocalConfig,
    globalCommonService: Commons,
  ): Promise<string>;
  download(
    env: Environment,
    localConfig: LocalConfig,
    globalCommonService: Commons
  ): Promise<DownloadResponse>;
}
