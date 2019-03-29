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
    const parsedLines: string[] = [];
    const lines = newContent.split("\n");
    let osMatch: RegExpMatchArray;
    let osFromPragma: string;

    let hostMatch: RegExpMatchArray;
    let hostFromPragma: string;

    let envMatch: RegExpMatchArray;
    let envFromPragma: string;
    let currentLine: string = "";

    for (let index = 0; index < lines.length; index++) {
      let shouldComment = false;
      currentLine = lines[index];
      if (this.PragmaRegExp.test(currentLine)) {
        try {
          // check OS pragma
          osMatch = currentLine.match(/os=(\w+)/);
          if (osMatch !== null) {
            osFromPragma = osMatch[1].toLowerCase();

            if (!SUPPORTED_OS.includes(osFromPragma)) {
              continue;
            }
            if (osTypeFromString(osFromPragma) !== osType) {
              shouldComment = true;
            }
          }
          // check host pragma
          hostMatch = currentLine.match(/host=(\S+)/);
          if (hostMatch !== null) {
            hostFromPragma = hostMatch[1];
            if (
              hostName === null ||
              hostName === "" ||
              hostFromPragma.toLowerCase() !== hostName.toLowerCase()
            ) {
              shouldComment = true;
            }
          }

          // check env pragma
          envMatch = currentLine.match(/env=(\S+)/);
          if (envMatch !== null) {
            envFromPragma = envMatch[1];
            if (process.env[envFromPragma.toUpperCase()] === undefined) {
              shouldComment = true;
            }
          }
          parsedLines.push(currentLine);
          index = this.checkNextLines(
            lines,
            parsedLines,
            index,
            false,
            shouldComment
          );
        } catch (e) {
          console.error("Sync: Error processing pragmas ", e.message);
          continue;
        }
      } else if (this.IgnorePragmaRegExp.test(currentLine)) {
        index = this.checkNextLines(lines, parsedLines, index, true, false);
      } else {
        parsedLines.push(currentLine);
      }
    }

    let result = parsedLines.join("\n");
    const ignoredBlocks = this.getIgnoredBlocks(localContent); // get the settings that must prevail
    result = result.replace(/{\s*\n/, `{\n${ignoredBlocks}\n\n\n`); // 3 lines breaks to separate from other settings
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
    const lines = settingsContent.split("\n");
    let osMatch: RegExpMatchArray;
    let osFromPragma: string;

    let hostMatch: RegExpMatchArray;
    let hostFromPragma: string;

    let envMatch: RegExpMatchArray;
    let envFromPragma: string;

    const parsedLines: string[] = [];
    let currentLine = "";

    for (let index = 0; index < lines.length; index++) {
      currentLine = lines[index];

      if (this.IgnorePragmaRegExp.test(currentLine)) {
        index = this.checkNextLines(lines, parsedLines, index, true);
      } else if (this.PragmaRegExp.test(currentLine)) {
        // alert not supported OS
        osMatch = currentLine.match(this.OSPragmaWhiteSpacesSupportRegExp);
        if (osMatch !== null) {
          osFromPragma = osMatch[1] || osMatch[2] || osMatch[3];

          if (osFromPragma !== "" && /\s/.test(osFromPragma)) {
            currentLine = currentLine.replace(
              osFromPragma,
              osFromPragma.trimLeft()
            );
          }

          const trimmed = osFromPragma.toLowerCase().trim();
          if (!SUPPORTED_OS.includes(trimmed)) {
            console.warn("Sync: Invalid OS", osFromPragma);
            throw new Error(
              localize(
                "cmd.updateSettings.warning.OSNotSupported",
                trimmed,
                index + 1
              )
            );
          }
        }

        hostMatch = currentLine.match(this.HostPragmaWhiteSpacesSupportRegExp);
        if (hostMatch !== null) {
          hostFromPragma = hostMatch[1] || hostMatch[2] || hostMatch[3];
          if (hostFromPragma !== "" && /\s/.test(hostFromPragma)) {
            currentLine = currentLine.replace(
              hostFromPragma,
              hostFromPragma.trimLeft()
            );
          }
        }

        envMatch = currentLine.match(this.EnvPragmaWhiteSpacesSupportRegExp);
        if (envMatch !== null) {
          envFromPragma = envMatch[1] || envMatch[2] || envMatch[3];
          if (envFromPragma !== "" && /\s/.test(envFromPragma)) {
            currentLine = currentLine.replace(
              envFromPragma,
              envFromPragma.trimLeft()
            );
          }
        }

        parsedLines.push(currentLine);
        index = this.checkNextLines(lines, parsedLines, index, false, false);
      } else {
        parsedLines.push(currentLine);
      }
    }

    return parsedLines.join("\n");
  }

  public static getIgnoredBlocks(content: string): string {
    content = content.replace(/\@sync ignore/g, "@sync-ignore");
    const ignoredLines: string[] = [];
    const lines = content.split("\n");
    let currentLine = "";
    for (let index = 0; index < lines.length; index++) {
      currentLine = lines[index];
      if (this.IgnorePragmaRegExp.test(currentLine)) {
        ignoredLines.push(currentLine);
        index = this.checkNextLines(
          lines,
          ignoredLines,
          index,
          false,
          false,
          true
        );
      }
    }
    return ignoredLines.join("\n");
  }

  public static removeAllComments(text: string): string {
    return text.replace(/\s*(\/\/.+)|(\/\*.+\*\/)/g, "");
  }

  private static readonly PragmaRegExp: RegExp = /\/{2}[\s\t]*\@sync[\s\t]+(?:os=.+[\s\t]*)?(?:host=.+[\s\t]*)?(?:env=.+[\s\t]*)?/;
  private static readonly IgnorePragmaRegExp: RegExp = /\/{2}[\s\t]*\@sync-ignore/;
  private static readonly HostPragmaWhiteSpacesSupportRegExp = /(?:host=(.+)os=)|(?:host=(.+)env=)|host=(.+)\n?/;
  private static readonly OSPragmaWhiteSpacesSupportRegExp = /(?:os=(.+)host=)|(?:os=(.+)env=)|os=(.+)\n?/;
  private static readonly EnvPragmaWhiteSpacesSupportRegExp = /(?:env=(.+)host=)|(?:env=(.+)os=)|env=(.+)\n?/;

  private static toggleComments(line: string, shouldComment: boolean) {
    if (shouldComment && !line.trim().startsWith("//")) {
      return "  //" + line; // 2 spaces as formmating
    } else {
      return line.replace("//", "");
    }
  }

  // checks and advance index
  private static checkNextLines(
    lines: string[],
    parsedLines: string[],
    currentIndex: number,
    shouldIgnore: boolean,
    shouldComment: boolean = false,
    checkTrailingComma: boolean = false
  ): number {
    let currentLine = lines[++currentIndex]; // check the next line for comments

    if (checkTrailingComma && !currentLine.trim().endsWith(",")) {
      currentLine = currentLine.trimRight() + ",";
    }
    // nothing more to do, just add the line to the parsedLines array
    if (!shouldIgnore) {
      parsedLines.push(this.toggleComments(currentLine, shouldComment));
    }

    const opensCurlyBraces = /".+"\s*:\s*{/.test(currentLine);
    const opensBrackets = /".+"\s*:\s*\[/.test(currentLine);

    let openedBlock = opensCurlyBraces || opensBrackets;
    if (openedBlock) {
      while (openedBlock) {
        currentLine = lines[++currentIndex];
        if (
          (opensCurlyBraces && currentLine.indexOf("}") !== -1) ||
          (opensBrackets && currentLine.indexOf("]") !== -1)
        ) {
          if (checkTrailingComma && !currentLine.trim().endsWith(",")) {
            currentLine = currentLine.trimRight() + ","; // we add a coma to avoid parse error when we paste the ignored settings at the beginning of the file
          }
          openedBlock = false;
        }
        if (!shouldIgnore) {
          parsedLines.push(this.toggleComments(currentLine, shouldComment));
        }
      }
    }

    return currentIndex;
  }
}
