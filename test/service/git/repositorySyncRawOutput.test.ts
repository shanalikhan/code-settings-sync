import { expect } from "chai";
import { GitRepositorySyncService } from "../../../src/service/git/repositorySync.service";
import { IExtensionState } from "../../../src/models/state.model";

describe("repository sync raw path output", () => {
  it("preserves leading whitespace from NUL-delimited ignored paths", async () => {
    const service = new GitRepositorySyncService({} as IExtensionState);
    let trimOutput: boolean | undefined;
    let removedPath = "";
    const subject = service as unknown as {
      runner: {
        run: (
          cwd: string,
          args: string[],
          shouldTrim?: boolean
        ) => Promise<string>;
      };
      untrackIgnoredFiles: (cwd: string) => Promise<void>;
    };
    subject.runner = {
      run: async (_cwd, args, shouldTrim) => {
        if (args[0] === "ls-files") {
          trimOutput = shouldTrim;
          return " leading-secret.json\0";
        }
        removedPath = args[args.length - 1];
        return "";
      }
    };

    await subject.untrackIgnoredFiles("/home/profile");

    expect(trimOutput).to.equal(false);
    expect(removedPath).to.equal(" leading-secret.json");
  });
});
