import { OsType } from "./enums";
import { osTypeFromString, SUPPORTED_OS } from "./environmentPath";
import localize from "./localize";

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
   * @param {string} newContent a valid JSON string
   * @returns {string}
   * @memberof PragmaUtil
   */
  public static processBeforeWrite(
    localContent: string,
    newContent: string,
    osType: OsType,
    hostName: string
  ): string {
    let result: string = newContent;

    const pragmaSettingsBlocks: RegExpMatchArray = result.match(
      this.PragmaRegExp
    );

    if (pragmaSettingsBlocks !== null) {
      let osMatch: RegExpMatchArray;
      let osFromPragma: string;

      let hostMatch: RegExpMatchArray;
      let hostFromPragma: string;

      let envMatch: RegExpMatchArray;
      let envFromPragma: string;

      for (const block of pragmaSettingsBlocks) {
        // line e.g.: // @sync os=windows host=Laptop\n"window.menuBarVisibility": "none",
        try {
          // check OS pragma
          osMatch = block.match(/os=(\w+)/);
          if (osMatch !== null) {
            osFromPragma = osMatch[1].toLowerCase();

            if (!SUPPORTED_OS.includes(osFromPragma)) {
              continue;
            }
            if (osTypeFromString(osFromPragma) !== osType) {
              result = result.replace(block, this.commentLineAfterBreak(block));
              continue; // no need to lookup the host name
            }
          }

          // check host pragma
          hostMatch = block.match(/host=(\S+)/);
          if (hostMatch !== null) {
            hostFromPragma = hostMatch[1];
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
          envMatch = block.match(/env=(\S+)/);
          if (envMatch !== null) {
            envFromPragma = envMatch[1];
            if (process.env[envFromPragma.toUpperCase()] === undefined) {
              result = result.replace(block, this.commentLineAfterBreak(block));
              continue;
            }
          }

          // if os, host and evn matched the current machine make sure to uncomment the setting
          result = result.replace(block, this.uncommentLineAfterBreak(block));
        } catch (e) {
          console.error("Sync: Error processing pragmas ", e.message);
          continue;
        }
      }
    }

    result = this.removeIgnoreBlocks(result);
    const ignoredBlocks = this.getIgnoredBlocks(localContent); // get the settings that must prevale
    result = result.replace(/{\s*\n/, `{\n${ignoredBlocks}\n`); // always formated with four spaces?
    // check is a valid JSON

    try {
      // remove comments and trailing comma
      const uncommented = this.removeAllComments(result).replace(
        /,\s*\}/g,
        " }"
      );
      JSON.parse(uncommented);
    } catch (e) {
      console.error("Sync: Result content is not a valid JSON.", e.message);
    }

    return result;
  }

  /**
   * Remove @sync-ignore settings before upload.
   *
   * @static
   * @param {string} settingsContent
   * @returns {string}
   * @memberof PragmaUtil
   */
  public static processBeforeUpload(settingsContent: string): string {
    let result: string = settingsContent;
    result = this.removeIgnoreBlocks(result);

    const lines = result.split("\n").map(l => l.trim());

    // alert not supported OS
    const pragmaMatches: RegExpMatchArray = result.match(this.PragmaRegExp);
    if (pragmaMatches) {
      let newBlock: string;

      let osMatch: RegExpMatchArray;
      let osFromPragma: string;

      let hostMatch: RegExpMatchArray;
      let hostFromPragma: string;

      let envMatch: RegExpMatchArray;
      let envFromPragma: string;

      for (const block of pragmaMatches) {
        newBlock = block;
        osMatch = newBlock.match(this.OSPragmaWhiteSpacesSupportRegExp);
        if (osMatch !== null) {
          osFromPragma = osMatch[1] || osMatch[2] || osMatch[3];

          if (osFromPragma !== "" && /\s/.test(osFromPragma)) {
            newBlock = newBlock.replace(osFromPragma, osFromPragma.trimLeft());
          }

          const trimmed = osFromPragma.toLowerCase().trim();
          if (!SUPPORTED_OS.includes(trimmed)) {
            console.warn("Sync: Invalid OS", osFromPragma);
            throw new Error(
              localize(
                "cmd.updateSettings.warning.OSNotSupported",
                trimmed,
                lines.indexOf(block.split("\n")[0]) + 1
              )
            );
          }
        }

        hostMatch = newBlock.match(this.HostPragmaWhiteSpacesSupportRegExp);
        if (hostMatch !== null) {
          hostFromPragma = hostMatch[1] || hostMatch[2] || hostMatch[3];
          if (hostFromPragma !== "" && /\s/.test(hostFromPragma)) {
            newBlock = newBlock.replace(
              hostFromPragma,
              hostFromPragma.trimLeft()
            );
          }
        }

        envMatch = block.match(this.EnvPragmaWhiteSpacesSupportRegExp);
        if (envMatch !== null) {
          envFromPragma = envMatch[1] || envMatch[2] || envMatch[3];
          if (envFromPragma !== "" && /\s/.test(envFromPragma)) {
            newBlock = newBlock.replace(
              envFromPragma,
              envFromPragma.trimLeft()
            );
          }
        }

        // uncomment line before upload
        result = result.replace(block, this.uncommentLineAfterBreak(newBlock));
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

  public static getIgnoredBlocks(content: string): string {
    content = content.replace(/\@sync ignore/g, "@sync-ignore");
    const ignoredBlocks: RegExpMatchArray = content.match(
      this.IgnorePragmaRegExp
    );
    if (ignoredBlocks == null) {
      return "";
    }
    return ignoredBlocks.join("");
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
      return block.replace(settingLine[1], l => "//" + l);
    }

    return block;
  }

  public static uncommentLineAfterBreak(block: string): string {
    const settingLine = block.match(/\n[ \t]*(.+)/);
    if (
      settingLine !== null &&
      settingLine[1] &&
      settingLine[1].startsWith("//")
    ) {
      return block.replace(settingLine[1], l => l.replace("//", ""));
    }

    return block;
  }

  public static removeAllComments(text: string): string {
    return text.replace(/\s*(\/\/.+)|(\/\*.+\*\/)/g, "");
  }

  private static readonly PragmaRegExp: RegExp = /\/\/[ \t]*\@sync[ \t]+(?:os=.+[ \t]*)?(?:host=.+[ \t]*)?(?:env=.+[ \t]*)?\n[ \t]*.+,?/g;
  private static readonly IgnorePragmaRegExp: RegExp = /[ \t]*\/\/[ \t]*\@sync-ignore.*\n.+,?\n+/g;
  private static readonly HostPragmaWhiteSpacesSupportRegExp = /(?:host=(.+)os=)|(?:host=(.+)env=)|host=(.+)\n?/;
  private static readonly OSPragmaWhiteSpacesSupportRegExp = /(?:os=(.+)host=)|(?:os=(.+)env=)|os=(.+)\n?/;
  private static readonly EnvPragmaWhiteSpacesSupportRegExp = /(?:env=(.+)host=)|(?:env=(.+)os=)|env=(.+)\n?/;
}
