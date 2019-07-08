import { IExtensionState } from "./models/state.model";
import { LocalizationService } from "./service/localization.service";

export const state: IExtensionState = {
  localize: LocalizationService.prototype.Localize.bind(
    new LocalizationService()
  )
};
