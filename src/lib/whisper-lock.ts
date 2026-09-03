import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { getDataDir } from "@/lib/data-dir";

function lockPath(): string {
  return path.join(getDataDir(), "whisper.worker.lock");
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

function readLockPid(): number | null {
  try {
    const pid = Number(readFileSync(lockPath(), "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isLockStale(): boolean {
  const pid = readLockPid();
  if (!pid) return true;
  return !isPidAlive(pid);
}

/** Só um processo Node por container conduz o Whisper. */
export function tryAcquireWhisperLeadership(): boolean {
  mkdirSync(getDataDir(), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath(), "wx");
      try {
        writeSync(fd, String(process.pid));
      } finally {
        closeSync(fd);
      }
      return true;
    } catch (error) {
      if (!isErrno(error, "EEXIST")) throw error;
      if (!isLockStale()) return false;
      try {
        unlinkSync(lockPath());
      } catch {
        return false;
      }
    }
  }

  return false;
}

export function releaseWhisperLeadership(): void {
  const pid = readLockPid();
  if (pid !== process.pid) return;
  try {
    unlinkSync(lockPath());
  } catch {
    // lock já sumiu ou outro processo assumiu
  }
}

/** Mata `transcribe.py --worker` órfãos neste PID namespace (container). */
export function killOrphanWhisperWorkers(keepPid?: number): number {
  let entries: string[];
  try {
    entries = readdirSync("/proc");
  } catch {
    return 0;
  }

  const doomed: number[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (!pid || pid === process.pid || pid === keepPid) continue;

    let cmdline: string;
    try {
      cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8");
    } catch {
      continue;
    }

    if (!cmdline.includes("transcribe.py") || !cmdline.includes("--worker")) continue;

    try {
      process.kill(pid, "SIGTERM");
      doomed.push(pid);
    } catch {
      // sem permissão ou já morreu
    }
  }

  if (doomed.length > 0) {
    setTimeout(() => {
      for (const pid of doomed) {
        if (pid === keepPid) continue;
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // já morreu
        }
      }
    }, 4_000).unref();
  }

  return doomed.length;
}
