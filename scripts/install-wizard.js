import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createInstallApp,
} from './install/app.js';
import {
  createInstallService,
} from './install/service.js';
import {
  createInstallState,
} from './install/state.js';

const scriptPath =
  fileURLToPath(
    import.meta.url,
  );
const projectRoot =
  path.resolve(
    path.dirname(
      scriptPath,
    ),
    '..',
  );

function integer(
  value,
  fallback,
  min,
  max,
) {
  const normalized =
    value === undefined ||
    value === ''
      ? fallback
      : Number(value);

  if (
    !Number.isInteger(normalized) ||
    normalized < min ||
    normalized > max
  ) {
    throw new Error(
      'Installer numeric setting is invalid',
    );
  }

  return normalized;
}

async function main() {
  const installState =
    await createInstallState({
      projectRoot,
      ttlMs:
        integer(
          process.env
            .INSTALL_TTL_MINUTES,
          60,
          10,
          720,
        ) *
        60_000,
    });
  const service =
    createInstallService({
      projectRoot,
      state:
        installState,
    });
  const host =
    process.env
      .INSTALL_HOST
      ?.trim() ||
    '127.0.0.1';
  const port =
    integer(
      process.env
        .INSTALL_PORT ??
        process.env
          .HTTP_PORT,
      3000,
      1,
      65535,
    );
  const localOnly =
    host === '127.0.0.1' ||
    host === '::1' ||
    host === 'localhost';
  const trustProxyHops =
    integer(
      process.env
        .INSTALL_TRUST_PROXY_HOPS ??
        process.env
          .HTTP_TRUST_PROXY_HOPS,
      localOnly ? 1 : 0,
      0,
      16,
    );

  let server;

  const {
    app,
    base,
  } =
    createInstallApp({
      service,
      installState,
      projectRoot,
      trustProxyHops,
      onComplete(result) {
        console.log(
          'Installation completed. Configuration written to ' +
            result.environmentFile,
        );
        console.log(
          'Start the application with: ' +
            result.nextCommand,
        );
        server?.close();
      },
    });

  await new Promise(
    (
      resolve,
      reject,
    ) => {
      server =
        app.listen(
          port,
          host,
          resolve,
        );
      server.on(
        'error',
        reject,
      );
    },
  );

  const publicOrigin =
    process.env
      .INSTALL_PUBLIC_ORIGIN
      ?.replace(
        /\/$/u,
        '',
      );
  const localOrigin =
    'http://' +
    (
      host ===
        '0.0.0.0'
        ? '127.0.0.1'
        : host
    ) +
    ':' +
    port;

  console.log('');
  console.log(
    'DTP-Stat initial setup wizard',
  );
  console.log(
    'Expires: ' +
      new Date(
        installState
          .expiresAt,
      ).toISOString(),
  );
  console.log(
    'Open exactly this one-time URL:',
  );
  console.log(
    (
      publicOrigin ||
      localOrigin
    ) +
      base +
      '/',
  );
  console.log(
    'The random URL and session cookie are valid only for this installer process.',
  );
  console.log('');
}

if (
  process.argv[1] &&
  path.resolve(
    process.argv[1],
  ) ===
    scriptPath
) {
  main().catch(
    (error) => {
      console.error(
        'Installer failed',
        error,
      );
      process.exitCode =
        1;
    },
  );
}
