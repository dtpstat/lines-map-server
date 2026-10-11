import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createInstallApp,
} from '../scripts/install/app.js';

async function listen(app) {
  const server =
    http.createServer(app);

  await new Promise(
    (
      resolve,
      reject,
    ) => {
      server.once(
        'error',
        reject,
      );
      server.listen(
        0,
        '127.0.0.1',
        resolve,
      );
    },
  );

  const address =
    server.address();

  return {
    server,
    baseUrl:
      'http://127.0.0.1:' +
      address.port,
  };
}

test('installer HTTP surface is hidden behind random path cookie and CSRF', async () => {
  const projectRoot =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        'dtpstat-install-app-',
      ),
    );
  const installDirectory =
    path.join(
      projectRoot,
      'install',
    );

  await fs.mkdir(
    installDirectory,
    {
      recursive: true,
    },
  );
  await fs.writeFile(
    path.join(
      installDirectory,
      'index.html',
    ),
    '<!doctype html><meta name="install-csrf" content="{{INSTALL_CSRF}}"><p>{{INSTALL_BASE}}</p>',
  );
  await fs.writeFile(
    path.join(
      installDirectory,
      'install.css',
    ),
    '',
  );
  await fs.writeFile(
    path.join(
      installDirectory,
      'install.js',
    ),
    '',
  );

  const installState = {
    routeId:
      'install-0123456789abcdef0123456789abcdef',
    sessionToken:
      'session-secret',
    csrfToken:
      'csrf-secret',
    assertActive() {},
  };
  const service = {
    state() {
      return {
        expiresAt:
          '2026-10-12T01:00:00.000Z',
      };
    },
    async configureEnvironment() {
      return {
        ok: true,
      };
    },
  };

  const {
    app,
    base,
  } =
    createInstallApp({
      service,
      installState,
      projectRoot,
    });
  const {
    server,
    baseUrl,
  } =
    await listen(app);

  try {
    const hidden =
      await fetch(
        baseUrl + '/',
      );
    assert.equal(
      hidden.status,
      404,
    );

    const page =
      await fetch(
        baseUrl +
          base +
          '/',
      );
    assert.equal(
      page.status,
      200,
    );
    assert.match(
      page.headers.get(
        'cache-control',
      ),
      /no-store/u,
    );
    const cookie =
      page.headers.get(
        'set-cookie',
      );
    assert.match(
      cookie,
      /dtpstat_install_session=session-secret/u,
    );

    const withoutCsrf =
      await fetch(
        baseUrl +
          base +
          '/api/environment',
        {
          method: 'POST',
          headers: {
            Cookie:
              'dtpstat_install_session=session-secret',
            'Content-Type':
              'application/json',
          },
          body: '{}',
        },
      );
    assert.equal(
      withoutCsrf.status,
      403,
    );

    const accepted =
      await fetch(
        baseUrl +
          base +
          '/api/environment',
        {
          method: 'POST',
          headers: {
            Cookie:
              'dtpstat_install_session=session-secret',
            'Content-Type':
              'application/json',
            'X-Install-CSRF':
              'csrf-secret',
          },
          body: '{}',
        },
      );
    assert.equal(
      accepted.status,
      200,
    );
  } finally {
    await new Promise(
      (resolve) =>
        server.close(resolve),
    );
    await fs.rm(
      projectRoot,
      {
        recursive: true,
        force: true,
      },
    );
  }
});
