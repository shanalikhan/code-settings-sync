import { existsSync, readFileSync } from "fs-extra";
import { resolve } from "path";
import { extensions } from "vscode";
import { ILanguagePack } from "../models/language-pack.model";

export class LocalizationService {
  private bundle = this.resolveLanguagePack();
  private options: { locale: string };

  public Localize(key: string, ...args: string[]): string {
    const message = this.bundle[key] || key;
    return this.Format(message, args.flat());
  }

  private Init() {
    try {
      this.options = {
        ...this.options,
        ...JSON.parse(process.env.VSCODE_NLS_CONFIG || "{}")
      };
    } catch (err) {
      throw err;
    }
  }

  private Format(message: string, args: string[] = []): string {
    return args.length
      ? message.replace(
          /\{(\d+)\}/g,
          (match, rest: any[]) => args[rest[0]] || match
        )
      : message;
  }

  private resolveLanguagePack(): ILanguagePack {
    this.Init();

    const languageFormat = "package.nls{0}.json";
    const defaultLanguage = languageFormat.replace("{0}", "");

    const rootPath = extensions.getExtension("Shan.code-settings-sync")
      .extensionPath;

    const resolvedLanguage = this.recurseCandidates(
      rootPath,
      languageFormat,
      this.options.locale
    );

    const languageFilePath = resolve(rootPath, resolvedLanguage);

    try {
      const defaultLanguageBundle = JSON.parse(
        resolvedLanguage !== defaultLanguage
          ? readFileSync(resolve(rootPath, defaultLanguage), "utf-8")
          : "{}"
      );

      const resolvedLanguageBundle = JSON.parse(
        readFileSync(languageFilePath, "utf-8")
      );

      return { ...defaultLanguageBundle, ...resolvedLanguageBundle };
    } catch (err) {
      throw err;
    }
  }

  private recurseCandidates(
    rootPath: string,
    format: string,
    candidate: string
  ): string {
    const filename = format.replace("{0}", `.${candidate}`);
    const filepath = resolve(rootPath, filename);
    if (existsSync(filepath)) {
      return filename;
    }
    if (candidate.split("-")[0] !== candidate) {
      return this.recurseCandidates(rootPath, format, candidate.split("-")[0]);
    }
    return format.replace("{0}", "");
  }
}
