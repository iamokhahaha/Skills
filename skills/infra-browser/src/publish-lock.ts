/**
 * Per-page file lock for browser automation scripts.
 *
 * Prevents multiple scripts from operating on the same browser page simultaneously.
 * Locks are keyed by page name (e.g., "xhs-publish", "bilibili-publish").
 * Only pages with "publish" in the name are locked — read-only/debug scripts are unaffected.
 *
 * Usage: integrated into client.ts — scripts don't need to import this directly.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { resolve } from "path";

const LOCK_DIR = resolve(process.cwd(), "tmp");
const POLL_INTERVAL = 3000;
const MAX_WAIT = 5 * 60 * 1000; // 5 min
const STALE_THRESHOLD = 10 * 60 * 1000; // 10 min

interface LockInfo {
  pid: number;
  script: string;
  pageName: string;
  startedAt: string;
}

function lockPath(pageName: string): string {
  // Sanitize page name for filesystem
  const safe = pageName.replace(/[^a-zA-Z0-9_-]/g, "-");
  return resolve(LOCK_DIR, `publish-lock-${safe}.lock`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLock(path: string): LockInfo | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function writeLock(path: string, pageName: string, script: string): void {
  if (!existsSync(LOCK_DIR)) mkdirSync(LOCK_DIR, { recursive: true });
  const info: LockInfo = {
    pid: process.pid,
    script,
    pageName,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(info, null, 2));
}

function removeLockFile(path: string): void {
  try {
    const lock = readLock(path);
    if (lock && lock.pid === process.pid) {
      unlinkSync(path);
    }
  } catch {
    // ignore
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Track locks held by this process for cleanup
const heldLocks = new Set<string>();

function cleanupAll(): void {
  for (const path of heldLocks) {
    removeLockFile(path);
  }
  heldLocks.clear();
}

// Register cleanup once
let cleanupRegistered = false;
function ensureCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  process.on("exit", cleanupAll);
  process.on("SIGINT", () => { cleanupAll(); process.exit(1); });
  process.on("SIGTERM", () => { cleanupAll(); process.exit(1); });
}

/**
 * Acquire a lock for a browser page. Waits if another process holds it.
 * Only locks pages with "publish" in the name.
 */
export async function acquirePageLock(pageName: string): Promise<void> {
  // Only lock publish pages
  if (!pageName.includes("publish")) return;

  const path = lockPath(pageName);
  const scriptName = process.argv[1]?.split("/").pop() ?? `pid-${process.pid}`;
  const start = Date.now();

  while (true) {
    const existing = readLock(path);

    if (!existing) {
      writeLock(path, pageName, scriptName);
      break;
    }

    if (!isProcessAlive(existing.pid)) {
      console.log(`[lock] Stale lock from dead process ${existing.pid} (${existing.script}), taking over`);
      writeLock(path, pageName, scriptName);
      break;
    }

    const age = Date.now() - new Date(existing.startedAt).getTime();
    if (age > STALE_THRESHOLD) {
      console.log(`[lock] Lock from ${existing.script} is ${Math.round(age / 1000)}s old, forcing takeover`);
      writeLock(path, pageName, scriptName);
      break;
    }

    const waited = Date.now() - start;
    if (waited > MAX_WAIT) {
      throw new Error(
        `[lock] Timed out after ${MAX_WAIT / 1000}s waiting for "${pageName}" ` +
        `(held by ${existing.script}, pid ${existing.pid})`
      );
    }

    console.log(`[lock] "${pageName}" is locked by ${existing.script} (pid ${existing.pid}, ${Math.round(age / 1000)}s), waiting...`);
    await sleep(POLL_INTERVAL);
  }

  heldLocks.add(path);
  ensureCleanup();
  console.log(`[lock] Acquired "${pageName}" (${scriptName}, pid ${process.pid})`);
}

/**
 * Release all page locks held by this process.
 */
export function releaseAllLocks(): void {
  if (heldLocks.size === 0) return;
  cleanupAll();
  console.log(`[lock] Released all locks (pid ${process.pid})`);
}
