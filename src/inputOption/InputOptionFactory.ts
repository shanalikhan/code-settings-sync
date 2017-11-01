import { Environment } from "../common/environmentPath";
import { Commons } from "../common/commons";
import { LocalConfig } from "../models/localConfig";
import { TaskType } from "../common/enums";
import { IInputOption } from "./IInputOption";
import { GitHubGistOption } from "./GitHubGistOption";
import { KeyValue } from "../models/keyvalue";

export class InputOptionFactory {

    private config: LocalConfig = null;
    constructor(private en: Environment, private com: Commons) {

    }

    public async getSettingType(params: KeyValue<string>[]): Promise<IInputOption> {

        return new Promise<IInputOption>(async (resolve, reject) => {
            this.config = await this.com.InitalizeSettings();
            this.config.publicGist = params.filter(m => m.Key == "publicGIST").length > 0 ? true : false;
            if (this.config.customConfig.type == TaskType.GitHubGist) {
                return new GitHubGistOption(this.config);
            }
            else {

            }
        });
    }
}