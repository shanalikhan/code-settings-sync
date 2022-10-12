import { existsSync, readFileSync } from "fs-extra";
import { resolve } from "path";
import { extensions } from "vscode";
import { ILanguagePack } from "./models/language-pack.model";

export class Localize {
  private bundle = this.resolveLanguagePack();
  private options: { locale: string };

  public localize(key: string, ...args: string[]): string {
    const message = this.bundle[key] || key;
    return this.format(message, args);
  }

  private init() {
    this.options = {
      ...this.options,
      ...JSON.parse(process.env.VSCODE_NLS_CONFIG || "{}")
    };
  }

  private format(message: string, args: string[] = []): string {
    return args.length
      ? message.replace(
          /\{(\d+)\}/g,
          (match, rest: any[]) => args[rest[0]] || match
        )
      : message;
  }

  private resolveLanguagePack(): ILanguagePack {
    this.init();

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

    const defaultLanguageBundle: Record<string, string> = JSON.parse(
      resolvedLanguage !== defaultLanguage
        ? readFileSync(resolve(rootPath, defaultLanguage), "utf-8")
        : "{}"
    );

    const resolvedLanguageBundle: Record<string, string> = JSON.parse(
      readFileSync(languageFilePath, "utf-8")
    );

    return { ...defaultLanguageBundle, ...resolvedLanguageBundle };
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

export default Localize.prototype.localize.bind(new Localize());
