import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function iso(value) {
  return new Date(value).toISOString();
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function createInstallState({
  projectRoot,
  ttlMs = 60 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  if (!projectRoot) {
    throw new TypeError('projectRoot is required');
  }

  const markerPath =
    path.join(
      projectRoot,
      'var',
      'install-completed.json',
    );

  if (await exists(markerPath)) {
    throw new Error(
      'Installation is already completed. Remove the completion marker only for deliberate recovery.',
    );
  }

  const routeId =
    'install-' +
    crypto
      .randomBytes(16)
      .toString('hex');
  const sessionToken =
    crypto
      .randomBytes(32)
      .toString('base64url');
  const csrfToken =
    crypto
      .randomBytes(24)
      .toString('base64url');
  const createdAt = now();
  const expiresAt =
    createdAt + ttlMs;
  const runtimeDirectory =
    path.join(
      projectRoot,
      'var',
      routeId,
    );

  await fs.mkdir(
    runtimeDirectory,
    {
      recursive: true,
      mode: 0o700,
    },
  );

  await fs.writeFile(
    path.join(
      runtimeDirectory,
      'state.json',
    ),
    JSON.stringify(
      {
        version: 1,
        routeId,
        createdAt:
          iso(createdAt),
        expiresAt:
          iso(expiresAt),
      },
      null,
      2,
    ) + '\n',
    {
      mode: 0o600,
    },
  );

  let completed = false;

  return {
    routeId,
    sessionToken,
    csrfToken,
    runtimeDirectory,
    markerPath,
    createdAt,
    expiresAt,
    get completed() {
      return completed;
    },
    assertActive() {
      if (
        completed ||
        now() >= expiresAt
      ) {
        const error =
          new Error(
            completed
              ? 'Installation is already completed'
              : 'Installation session has expired',
          );
        error.statusCode = 404;
        throw error;
      }
    },
    async complete(metadata) {
      if (completed) return;

      await fs.mkdir(
        path.dirname(
          markerPath,
        ),
        {
          recursive: true,
          mode: 0o750,
        },
      );

      const temporaryMarker =
        markerPath +
        '.tmp-' +
        process.pid;

      await fs.writeFile(
        temporaryMarker,
        JSON.stringify(
          {
            version: 1,
            completedAt:
              iso(now()),
            ...metadata,
          },
          null,
          2,
        ) + '\n',
        {
          mode: 0o600,
        },
      );
      await fs.rename(
        temporaryMarker,
        markerPath,
      );
      await fs.rm(
        runtimeDirectory,
        {
          recursive: true,
          force: true,
        },
      );
      completed = true;
    },
  };
}
