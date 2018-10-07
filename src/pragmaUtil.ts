import { OsType } from "./enums";
import localize from "./localize";

const SUPPORTED_OS = ["windows", "linux", "mac"];

export function GetOsEnum(osName: string): OsType {
  switch (osName.toLowerCase()) {
    case "windows":
      return OsType.Windows;
    case "linux":
      return OsType.Linux;
    case "mac":
      return OsType.Mac;
  }
}

/**
 * Comment/Uncomment lines if matches OS name or Hostname.
 * Usage: @sync os=[OS name] host=[hostName]
 * Notes: Hostname must be defined in sync.host setting. It could be used for parse any JSON valid string.
 * @export
 * @class PragmaUtil
 */
export default class PragmaUtil {
  /**
   * Process @sync pragma statements before file is saved.
   * Comment lines that don't match with the user OS or host value.
   * @static
   * @param {string} settingsContent a valid JSON string
   * @returns {string}
   * @memberof PragmaUtil
   */
  public static processBeforeWrite(
    settingsContent: string,
    osType: OsType,
    hostName: string
  ): string {
    let result: string = settingsContent;

    const pragmaSettingsBlocks: RegExpMatchArray = result.match(
      this.PragmaRegExp
    );

    if (pragmaSettingsBlocks !== null) {
      for (let block of pragmaSettingsBlocks) {
        // line e.g.: // @sync os=windows host=Laptop\n"window.menuBarVisibility": "none",

        try {
          // check OS pragma
          const osMatch: RegExpMatchArray = block.match(/os=(\w+)/);
          if (osMatch !== null) {
            const osFromPragma = osMatch[1].toLowerCase();

            if (!SUPPORTED_OS.includes(osFromPragma)) {
              continue;
            }
            if (GetOsEnum(osFromPragma) !== osType) {
              result = result.replace(block, this.commentLineAfterBreak(block));
              continue; // no need to lookup the host name
            }
          }

          // check host pragma
          const hostMatch: RegExpMatchArray = block.match(/host=(\S+)/);
          if (hostMatch !== null) {
            const hostFromPragma = hostMatch[1];
            if (
              hostName === null ||
              hostName === "" ||
              hostFromPragma.toLowerCase() !== hostName.toLowerCase()
            ) {
              result = result.replace(block, this.commentLineAfterBreak(block));
              continue;
            }
          }

          // check env pragma
          const envMatch: RegExpMatchArray = block.match(/env=(\S+)/);
          if (envMatch !== null) {
            const envFromPragma = envMatch[1];
            if (!process.env[envFromPragma.toUpperCase()]) {
              result = result.replace(block, this.commentLineAfterBreak(block));
            }
          }
        } catch (e) {
          continue;
        }
      }
    }

    result = this.removeIgnoreBlocks(result);

    return result;
  }

  /**
   * Remove @sync-ignore settings before upload.
   *
   * @static
   * @param {string} settingsContent
   * @param {require('vscode').window} window
   * @returns {string}
   * @memberof PragmaUtil
   */
  public static processBeforeUpload(settingsContent: string, window): string {
    let result: string = settingsContent;
    result = this.removeIgnoreBlocks(result);

    const lines = result.split("\n");

    // alert not supported OS
    const pragmaMatches: RegExpMatchArray = result.match(this.PragmaRegExp);
    if (pragmaMatches) {
      for (let block of pragmaMatches) {
        try {
          let newBlock: string;
          const osMatch: RegExpMatchArray = block.match(
            this.OSPragmaWhiteSpacesSupportRegExp
          );
          if (osMatch !== null) {
            const osFromPragma = osMatch[1] || osMatch[2] || osMatch[3];

            if (osFromPragma !== "" && /\s/.test(osFromPragma)) {
              newBlock = block.replace(osFromPragma, osFromPragma.trimLeft());
              result = result.replace(block, newBlock);
              block = newBlock;
            }

            const trimmed = osFromPragma.toLowerCase().trim();
            if (!SUPPORTED_OS.includes(trimmed)) {
              console.warn("Sync: Invalid OS", osFromPragma);
              if (window !== null) {
                window.showWarningMessage(
                  localize(
                    "cmd.updateSettings.warning.OSNotSupported",
                    trimmed,
                    lines.indexOf(block)
                  )
                );
              }
            }
          }

          const hostMatch: RegExpMatchArray = block.match(
            this.HostPragmaWhiteSpacesSupportRegExp
          );
          if (hostMatch !== null) {
            const hostFromPragma = hostMatch[1] || hostMatch[2] || hostMatch[3];
            if (hostFromPragma !== "" && /\s/.test(hostFromPragma)) {
              newBlock = block.replace(
                hostFromPragma,
                hostFromPragma.trimLeft()
              );
              result = result.replace(block, newBlock);

              block = newBlock;
            }
          }

          const envMatch: RegExpMatchArray = block.match(
            this.EnvPragmaWhiteSpacesSupportRegExp
          );
          if (envMatch !== null) {
            const envFromPragma = envMatch[1] || envMatch[2] || envMatch[3];
            if (envFromPragma !== "" && /\s/.test(envFromPragma)) {
              result = result.replace(
                block,
                block.replace(envFromPragma, envFromPragma.trimLeft())
              );
            }
          }
        } catch (e) {
          console.log("Sync: Proccess before upload error.", e.message);
          continue;
        }
      }
    }

    return result;
  }

  public static removeIgnoreBlocks(settingsContent: string): string {
    let result: string = settingsContent;
    result = result.replace(/\@sync ignore/g, "@sync-ignore");
    const ignoreSettingsBlocks: RegExpMatchArray = result.match(
      this.IgnorePragmaRegExp
    );

    if (ignoreSettingsBlocks !== null) {
      for (const block of ignoreSettingsBlocks) {
        result = result.replace(block, "");
      }
    }

    return result;
  }

  public static matchPragmaSettings(settingsContent: string): RegExpMatchArray {
    return settingsContent.match(this.PragmaRegExp);
  }

  /**
   * Insert Javascript comment slashes
   *
   * @private
   * @param {string} settingContent
   * @param {string} line
   * @returns {strign}
   * @memberof PragmaUtil
   */
  public static commentLineAfterBreak(block: string): string {
    const settingLine = block.match(/\n[ \t]*(.+)/);
    if (
      settingLine !== null &&
      settingLine[1] &&
      !settingLine[1].startsWith("//")
    ) {
      return block.replace(settingLine[1], l => "// " + l);
    }

    return block;
  }

  private static readonly PragmaRegExp: RegExp = /\/\/[ \t]*\@sync[ \t]+(?:os=.+[ \t]*)?(?:host=.+[ \t]*)?(?:env=.+[ \t]*)?\n[ \t]*.+,?/g;
  private static readonly IgnorePragmaRegExp: RegExp = /\/\/[ \t]*\@sync-ignore.*\n.+,?/g;
  private static readonly HostPragmaWhiteSpacesSupportRegExp = /(?:host=(.+)os=)|(?:host=(.+)env=)|host=(.+)\n?/;
  private static readonly OSPragmaWhiteSpacesSupportRegExp = /(?:os=(.+)host=)|(?:os=(.+)env=)|os=(.+)\n?/;
  private static readonly EnvPragmaWhiteSpacesSupportRegExp = /(?:env=(.+)host=)|(?:env=(.+)os=)|env=(.+)\n?/;
}
