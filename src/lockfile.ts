import * as lockfile from "lockfile";
import { Util } from "./util";

interface IOptions {
  wait?: number;
  pollPeriod?: number;
  stale?: number;
  retries?: number;
  retryWait?: number;
}

export default {
  check,
  lock,
  unlock
};

export function check(
  filepath: string,
  options: IOptions = {}
): Promise<boolean> {
  return Util.promisify(lockfile.check)(filepath, options);
}

export function lock(
  filepath: string,
  options: IOptions = {}
): Promise<boolean> {
  return Util.promisify(lockfile.lock)(filepath, options);
}

export function unlock(filepath: string): Promise<boolean> {
  return Util.promisify(lockfile.unlock)(filepath);
}
