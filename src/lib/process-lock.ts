import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
import { getDataDir } from "@/lib/data-dir";

function lockPath(name: string): string {
  return path.join(getDataDir(), `${name}.lock`);
}

function isErrno(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isErrno(error, "ESRCH");
  }
}

function readLockPid(name: string): number | null {
  try {
    const pid = Number(readFileSync(lockPath(name), "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isLockStale(name: string): boolean {
  const pid = readLockPid(name);
  if (!pid) return true;
  return !isPidAlive(pid);
}

/** Trava de arquivo por nome — só um processo Node no container vence. */
export function tryAcquireProcessLock(name: string): boolean {
  mkdirSync(getDataDir(), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath(name), "wx");
      try {
        writeSync(fd, String(process.pid));
      } finally {
        closeSync(fd);
      }
      return true;
    } catch (error) {
      if (!isErrno(error, "EEXIST")) throw error;
      if (!isLockStale(name)) return false;
      try {
        unlinkSync(lockPath(name));
      } catch {
        return false;
      }
    }
  }

  return false;
}

export function releaseProcessLock(name: string): void {
  const pid = readLockPid(name);
  if (pid !== process.pid) return;
  try {
    unlinkSync(lockPath(name));
  } catch {
    // lock já sumiu ou outro processo assumiu
  }
}
