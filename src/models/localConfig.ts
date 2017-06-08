import { ExtensionConfig } from './extensionConfig';
import { CustomSetting } from './customSetting';


export class LocalConfig {
    public publicGist: boolean = false;
    public userName: string = null;
    public name: string = null;
    public extConfig: ExtensionConfig = null;
    public customConfig: CustomSetting = null;

    constructor() {
        this.extConfig = new ExtensionConfig();
        this.customConfig = new CustomSetting();
    }
}