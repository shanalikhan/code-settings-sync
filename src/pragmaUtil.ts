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

    const parseLine = (line: string, shouldComment: boolean) => {
      if (!line.trim().startsWith("//") && shouldComment) {
        return "//" + line;
      } else {
        return line.replace("//", "");
      }
    };

    for (let index = 0; index < lines.length; index++) {
      let shouldComment = false;
      currentLine = lines[index];
      if (this.PragmaRegExp.test(currentLine)) {
        parsedLines.push(currentLine);
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

          currentLine = lines[++index]; // check the next line for comments
          parsedLines.push(parseLine(currentLine, shouldComment));
          if (currentLine.match(/".+"\s*:\s*{/)) {
            let openedBlock = true;
            while (openedBlock) {
              currentLine = lines[++index];
              parsedLines.push(parseLine(currentLine, shouldComment));
              if (currentLine.indexOf("}") !== -1) {
                openedBlock = false;
              }
            }
          }
        } catch (e) {
          console.error("Sync: Error processing pragmas ", e.message);
          continue;
        }
      } else if (this.IgnorePragmaRegExp.test(currentLine)) {
        currentLine = lines[++index]; // ignore the following lines
        if (currentLine.match(/".+"\s*:\s*{/)) {
          let openedBlock = true;
          while (openedBlock) {
            index++;
            if (currentLine.indexOf("}") !== -1) {
              openedBlock = false;
            }
          }
        }
      } else {
        parsedLines.push(currentLine);
      }
    }

    let result = parsedLines.join("\n");
    const ignoredBlocks = this.getIgnoredBlocks(localContent); // get the settings that must prevail
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
        currentLine = lines[++index]; // ignore the following lines
        if (currentLine.match(/".+"\s*:\s*{/)) {
          let openedBlock = true;
          while (openedBlock) {
            index++;
            if (currentLine.indexOf("}") !== -1) {
              openedBlock = false;
            }
          }
        }
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
        currentLine = lines[++index]; // check the next line for comments
        parsedLines.push(currentLine.replace("//", ""));
        if (currentLine.match(/".+"\s*:\s*{/)) {
          let openedBlock = true;
          while (openedBlock) {
            currentLine = lines[++index];
            parsedLines.push(currentLine.replace("//", ""));
            if (currentLine.indexOf("}") !== -1) {
              openedBlock = false;
            }
          }
        }
      } else {
        parsedLines.push(currentLine);
      }
    }

    return parsedLines.join("\n");
  }

  public static getIgnoredBlocks(content: string): string {
    content = content.replace(/\@sync ignore/g, "@sync-ignore");
    const ignoredBlocks: string[] = [];
    const lines = content.split("\n");
    let currentLine = "";
    for (let index = 0; index < lines.length; index++) {
      currentLine = lines[index];
      if (this.IgnorePragmaRegExp.test(currentLine)) {
        ignoredBlocks.push(currentLine);
        currentLine = lines[++index];
        ignoredBlocks.push(currentLine);

        if (currentLine.match(/".+"\s*:\s*{/)) {
          let openedBlock = true;
          while (openedBlock) {
            currentLine = lines[++index];
            ignoredBlocks.push(currentLine.replace("//", ""));
            if (currentLine.indexOf("}") !== -1) {
              openedBlock = false;
            }
          }
        }
      }
    }
    return ignoredBlocks.join("\n");
  }

  public static removeAllComments(text: string): string {
    return text.replace(/\s*(\/\/.+)|(\/\*.+\*\/)/g, "");
  }

  private static readonly PragmaRegExp: RegExp = /\/{2}[\s\t]*\@sync[\s\t]+(?:os=.+[\s\t]*)?(?:host=.+[\s\t]*)?(?:env=.+[\s\t]*)?/;
  private static readonly IgnorePragmaRegExp: RegExp = /\/{2}[\s\t]*\@sync-ignore/;
  private static readonly HostPragmaWhiteSpacesSupportRegExp = /(?:host=(.+)os=)|(?:host=(.+)env=)|host=(.+)\n?/;
  private static readonly OSPragmaWhiteSpacesSupportRegExp = /(?:os=(.+)host=)|(?:os=(.+)env=)|os=(.+)\n?/;
  private static readonly EnvPragmaWhiteSpacesSupportRegExp = /(?:env=(.+)host=)|(?:env=(.+)os=)|env=(.+)\n?/;
}
