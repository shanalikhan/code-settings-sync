import { SyncOption, GitHost } from "./enums";

export class SyncGlobalSettings {
    public syncOption: SyncOption = SyncOption.Gist; // Default to Gist for backward compatibility
    public gist: string | null = null;
    public lastUpload?: Date;
    public lastDownload?: Date;
    public autoUpload: boolean = false;
    public autoDownload: boolean = false;
    public showStatusBar: boolean = true;
    public donotShowInfoMsg: boolean = false;
    public donotShowPopUp: boolean = false;
    public setGist: boolean = false;
    public askEnterprise: boolean = false;
    public host: string | null = null;
    public token: string | null = null;
    public customConfig: boolean = false;
    public proxy: string | null = null;
    public proxyStrictSSL: boolean = true;
    public quietSync: boolean = false;
    public disableUpdateMessage: boolean = false;
    public disableVersionCheck: boolean = false;
    public enableAppInsights: boolean = true;
    public machineId: string | null = null;
    public anonymousMachineId: string | null = null;

    // New Git Sync Settings
    public gitHost: GitHost | null = null;
    public gitRepositoryUrl: string | null = null;
    public gitBranch: string = "main"; // Default branch
    public gitEnterpriseUrl: string | null = null; // For GitHub Enterprise or GitLab self-hosted
    public gitRepositoryId: string | null = null; // To store internal ID if needed for API calls
}
