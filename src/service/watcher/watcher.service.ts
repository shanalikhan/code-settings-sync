import { IExtensionState } from "../../models/state.model";
import { AutoUploadService } from "./autoUpload.service";

export class WatcherService {
  public autoUploadService: AutoUploadService;
  constructor(private state: IExtensionState) {
    this.InitializeAutoUpload();
  }
  public async InitializeAutoUpload() {
    const ignored = AutoUploadService.GetIgnoredItems(
      await this.state.commons.GetCustomSettings()
    );
    this.autoUploadService = new AutoUploadService(ignored);
  }
  public async HandleStartWatching() {
    if (this.autoUploadService) {
      this.autoUploadService.StartWatching();
    } else {
      await this.InitializeAutoUpload();
      this.HandleStartWatching();
    }
  }

  public async HandleStopWatching() {
    if (this.autoUploadService) {
      this.autoUploadService.StopWatching();
    } else {
      await this.InitializeAutoUpload();
      this.HandleStopWatching();
    }
  }
}
