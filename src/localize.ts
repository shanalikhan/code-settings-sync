import * as fs from "fs-extra";
import * as path from "path";
import { extensions } from "vscode";

interface IConfig {
  locale?: string;
}

interface ILanguagePack {
  [key: string]: string;
}

export class Localize {
  private bundle: ILanguagePack;
  constructor(private options: IConfig = {}) {}
  /**
   * translate the key
   * @param key
   * @param args
   */
  public localize(key: string, ...args: any[]): string {
    const languagePack = this.bundle;
    const message: string = languagePack[key] || key;
    return this.format(message, args);
  }
  public async init() {
    this.bundle = await this.resolveLanguagePack();
  }
  /**
   * format the message
   * @param message
   * @param args
   */
  private format(message: string, args: any[] = []): string {
    let result: string;
    if (args.length === 0) {
      result = message;
    } else {
      result = message.replace(/\{(\d+)\}/g, (match, rest: any[]) => {
        const index = rest[0];
        return typeof args[index] !== "undefined" ? args[index] : match;
      });
    }
    return result;
  }
  /**
   * Get language pack
   */
  private async resolveLanguagePack(): Promise<ILanguagePack> {
    const defaultResvoleLanguage = ".nls.json";
    let resolvedLanguage: string = "";
    // TODO: it should read the extension root path from context
    const rootPath = extensions.getExtension("Shan.code-settings-sync")
      .extensionPath;
    const file = path.join(rootPath, "package");
    const options = this.options;

    if (!options.locale) {
      resolvedLanguage = defaultResvoleLanguage;
    } else {
      let locale: string | null = options.locale;
      while (locale) {
        const candidate = ".nls." + locale + ".json";
        if (await fs.pathExists(file + candidate)) {
          resolvedLanguage = candidate;
          break;
        } else {
          const index = locale.lastIndexOf("-");
          if (index > 0) {
            locale = locale.substring(0, index);
          } else {
            resolvedLanguage = ".nls.json";
            locale = null;
          }
        }
      }
    }

    let defaultLanguageBundle = {};

    // if not use default language
    // then merger the Language pack
    // just in case the resolveLanguage bundle missing the translation and fallback with default language
    if (resolvedLanguage !== defaultResvoleLanguage) {
      defaultLanguageBundle = JSON.parse(
        fs.readFileSync(path.join(file + defaultResvoleLanguage), "utf-8")
      );
    }

    const languageFilePath = path.join(file + resolvedLanguage);

    const isExistResolvedLanguage = await fs.pathExists(languageFilePath);

    const ResolvedLanguageBundle = isExistResolvedLanguage
      ? JSON.parse(fs.readFileSync(languageFilePath, "utf-8"))
      : {};

    // merger with default language bundle
    return { ...defaultLanguageBundle, ...ResolvedLanguageBundle };
  }
}

let config: IConfig = {
  locale: "en"
};

try {
  config = Object.assign(
    config,
    JSON.parse((process.env as any).VSCODE_NLS_CONFIG)
  );
} catch (err) {
  //
}

const instance = new Localize(config);

const init = instance.init.bind(instance);

export default instance.localize.bind(instance);

export { init };
