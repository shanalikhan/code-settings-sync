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
  Check,
  Lock,
  Unlock
};

export function Check(
  filepath: string,
  options: IOptions = {}
): Promise<boolean> {
  return Util.promisify(lockfile.check)(filepath, options);
}

export function Lock(
  filepath: string,
  options: IOptions = {}
): Promise<boolean> {
  if (!Check(filepath)) {
    return Util.promisify(lockfile.lock)(filepath, options);
  }
  return Promise.resolve(false);
}

export function Unlock(filepath: string): Promise<boolean> {
  if (Check(filepath)) {
    return Util.promisify(lockfile.unlock)(filepath);
  }
  return Promise.resolve(false);
}
