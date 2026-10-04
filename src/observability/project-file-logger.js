import fs from 'node:fs';
import {
  access,
  appendFile,
  readdir,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  pipeline,
} from 'node:stream/promises';

const FILES = Object.freeze({
  error: 'errors.log',
  security: 'security.log',
});

const WRITE_MODE = 0o640;

function utcDayKey(date) {
  return date.toISOString().slice(0, 10);
}

function utcWeekKey(date) {
  const value = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
  return value.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

function periodKey(date, interval) {
  return interval === 'weekly' ? utcWeekKey(date) : utcDayKey(date);
}

function archiveStamp(date) {
  return date.toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z');
}

function normalizeRuntimeSettings(settings) {
  return {
    enabled: settings?.fileLoggingEnabled === true,
    maxSizeBytes: Math.max(1, Number(settings?.fileLogRotateMaxSizeMb ?? 50)) * 1024 * 1024,
    interval: settings?.fileLogRotateInterval === 'weekly' ? 'weekly' : 'daily',
    retentionDays: Math.max(1, Number(settings?.fileLogRetentionDays ?? 30)),
    maxArchives: Math.max(1, Number(settings?.fileLogMaxArchives ?? 30)),
    compress: settings?.fileLogCompress !== false,
  };
}

function safeErrorDetails(error) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    code: error && typeof error === 'object' && 'code' in error
      ? error.code ?? null
      : null,
    message: error instanceof Error ? error.message : String(error),
  };
}

async function compressArchive(filePath) {
  const target = filePath + '.gz';
  await pipeline(
    fs.createReadStream(filePath),
    zlib.createGzip(),
    fs.createWriteStream(target, { mode: WRITE_MODE }),
  );
  await unlink(filePath);
}

async function existingFile(filePath) {
  try {
    return await stat(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function createProjectFileLogger({
  directory = null,
  now = () => new Date(),
  output = console,
} = {}) {
  let runtime = normalizeRuntimeSettings(null);
  let operational = false;
  let lastError = null;
  const queues = new Map();
  const absoluteDirectory = directory ? path.resolve(directory) : null;

  function reportFailure(event, error) {
    lastError = safeErrorDetails(error);
    output.error('[service] file-log:' + event, lastError);
  }

  async function pruneArchives(baseName) {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    const prefix = baseName + '.';
    const candidates = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith(prefix)) continue;
      const filePath = path.join(absoluteDirectory, entry.name);
      const metadata = await stat(filePath);
      candidates.push({ filePath, mtimeMs: metadata.mtimeMs });
    }

    candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
    const cutoff = now().valueOf() - runtime.retentionDays * 86400000;

    for (let index = 0; index < candidates.length; index += 1) {
      const item = candidates[index];
      if (index >= runtime.maxArchives || item.mtimeMs < cutoff) {
        await unlink(item.filePath).catch((error) => reportFailure('prune', error));
      }
    }
  }

  async function rotateIfNeeded(filePath, bytes) {
    const metadata = await existingFile(filePath);
    if (!metadata) return;

    const current = now();
    const sizeRotation = metadata.size + bytes > runtime.maxSizeBytes;
    const timeRotation =
      periodKey(metadata.mtime, runtime.interval) !==
      periodKey(current, runtime.interval);

    if (!sizeRotation && !timeRotation) return;

    const baseName = path.basename(filePath);
    let archive = filePath + '.' + archiveStamp(current);
    let suffix = 0;
    while (
      await existingFile(archive) ||
      await existingFile(archive + '.gz')
    ) {
      suffix += 1;
      archive = filePath + '.' + archiveStamp(current) + '.' + suffix;
    }

    await rename(filePath, archive);
    if (runtime.compress) await compressArchive(archive);
    await pruneArchives(baseName);
  }

  async function appendRecord(kind, record) {
    if (!runtime.enabled || !operational || !absoluteDirectory) return;
    const fileName = FILES[kind];
    if (!fileName) return;

    const filePath = path.join(absoluteDirectory, fileName);
    const line = JSON.stringify(record) + '\n';
    const bytes = Buffer.byteLength(line, 'utf8');

    await rotateIfNeeded(filePath, bytes);
    await appendFile(filePath, line, {
      encoding: 'utf8',
      mode: WRITE_MODE,
    });
  }

  function write(kind, record) {
    if (!runtime.enabled) return;
    const previous = queues.get(kind) ?? Promise.resolve();
    const next = previous
      .then(() => appendRecord(kind, record))
      .catch((error) => reportFailure('write', error));
    queues.set(kind, next);
  }

  async function configure(settings) {
    runtime = normalizeRuntimeSettings(settings);
    lastError = null;

    if (!runtime.enabled) {
      operational = false;
      return status();
    }

    if (!absoluteDirectory) {
      operational = false;
      reportFailure('configure', new Error('File log directory is not configured'));
      return status();
    }

    try {
      await access(absoluteDirectory, fs.constants.W_OK);
      operational = true;
    } catch (error) {
      operational = false;
      reportFailure('configure', error);
    }
    return status();
  }

  async function flush() {
    await Promise.all(queues.values());
  }

  function status() {
    return {
      configured: runtime.enabled,
      operational: runtime.enabled && operational,
      directory: absoluteDirectory,
      files: {
        errors: absoluteDirectory ? path.join(absoluteDirectory, FILES.error) : null,
        security: absoluteDirectory ? path.join(absoluteDirectory, FILES.security) : null,
      },
      rotation: {
        maxSizeMb: runtime.maxSizeBytes / 1024 / 1024,
        interval: runtime.interval,
        retentionDays: runtime.retentionDays,
        maxArchives: runtime.maxArchives,
        compress: runtime.compress,
      },
      lastError,
    };
  }

  return {
    configure,
    flush,
    status,
    write,
  };
}
