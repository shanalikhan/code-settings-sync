import { existsSync, readFileSync } from "fs-extra";
import { join, resolve } from "path";
import { state } from "../state";
import { LoggerService } from "./logger.service";

export class LocalizationService {
  private bundle: ILanguagePack;
  private options: { locale: string };

  constructor() {
    this.Init();
  }

  public Localize(key: string, ...args: any[]): string {
    const languagePack = this.bundle;
    const message: string = (languagePack && languagePack[key]) || key;
    return this.Format(message, args);
  }

  private Init() {
    this.options = {
      locale: "en"
    };

    try {
      const pathToLocale = resolve(
        state.environment.USER_FOLDER,
        "locale.json"
      );
      if (existsSync(pathToLocale)) {
        const contents = readFileSync(pathToLocale, "utf-8");
        this.options = {
          ...this.options,
          ...(contents ? JSON.parse(contents) : {})
        };
      }
    } catch (err) {
      //
    }

    this.bundle = this.ResolveLanguagePack();
    LoggerService.defaultError = this.Localize("common.error.message");
  }

  private Format(message: string, args: any[] = []): string {
    let result: string;
    if (args.length === 0) {
      result = message;
    } else {
      result = message.replace(/\{(\d+)\}/g, (match, rest: any[]) => {
        const index = rest[0];
        return args[index] ? args[index] : match;
      });
    }
    return result;
  }

  private ResolveLanguagePack(): ILanguagePack {
    const defaultResvoleLanguage = ".nls.json";
    let resolvedLanguage: string = "";
    const rootPath = state.context.extensionPath;
    const file = join(rootPath, "package");
    const options = this.options;

    if (!options.locale) {
      resolvedLanguage = defaultResvoleLanguage;
    } else {
      let locale: string | null = options.locale;
      while (locale) {
        const candidate = ".nls." + locale + ".json";
        if (existsSync(file + candidate)) {
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
        readFileSync(join(file + defaultResvoleLanguage), "utf-8")
      );
    }

    const languageFilePath = join(file + resolvedLanguage);

    const isExistResolvedLanguage = existsSync(languageFilePath);

    const ResolvedLanguageBundle = isExistResolvedLanguage
      ? JSON.parse(readFileSync(languageFilePath, "utf-8"))
      : {};

    // merger with default language bundle
    return { ...defaultLanguageBundle, ...ResolvedLanguageBundle };
  }
}
