import { check, lock, unlock } from "lockfile";
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
  return Util.promisify(check)(filepath, options);
}

export function Lock(
  filepath: string,
  options: IOptions = {}
): Promise<boolean> {
  return Util.promisify(lock)(filepath, options);
}

export function Unlock(filepath: string): Promise<boolean> {
  return Util.promisify(unlock)(filepath);
}
