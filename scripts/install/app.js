import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs/promises';
import path from 'node:path';

function cookieValue(
  request,
  name,
) {
  const raw =
    request.headers
      ?.cookie ??
    '';

  for (
    const item of
    raw.split(';')
  ) {
    const [
      key,
      ...parts
    ] =
      item.trim()
        .split('=');

    if (key === name) {
      return decodeURIComponent(
        parts.join('='),
      );
    }
  }

  return null;
}

function requestOrigin(
  request,
) {
  const host =
    request.get('host');

  if (!host) return null;

  return (
    request.protocol +
    '://' +
    host
  );
}

export function createInstallApp({
  service,
  installState,
  projectRoot,
  trustProxyHops = 0,
  onComplete = () => {},
}) {
  const app =
    express();
  const base =
    '/' +
    installState.routeId;
  const installDirectory =
    path.join(
      projectRoot,
      'install',
    );
  const attempts =
    new Map();

  app.disable(
    'x-powered-by',
  );
  app.set(
    'trust proxy',
    trustProxyHops > 0
      ? trustProxyHops
      : false,
  );

  app.use(
    helmet({
      strictTransportSecurity:
        false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [
            "'self'",
          ],
          scriptSrc: [
            "'self'",
          ],
          styleSrc: [
            "'self'",
          ],
          imgSrc: [
            "'self'",
            'data:',
          ],
          connectSrc: [
            "'self'",
          ],
        },
      },
    }),
  );

  app.use(
    (
      request,
      response,
      next,
    ) => {
      response.set(
        'Cache-Control',
        'no-store, max-age=0',
      );
      response.set(
        'Pragma',
        'no-cache',
      );

      if (
        !request.path
          .startsWith(base)
      ) {
        response
          .status(404)
          .type('text')
          .send('Not found');
        return;
      }

      try {
        installState
          .assertActive();
      } catch {
        response
          .status(404)
          .type('text')
          .send('Not found');
        return;
      }

      const key =
        request.ip ??
        request.socket
          ?.remoteAddress ??
        'unknown';
      const now =
        Date.now();
      const record =
        attempts.get(key) ?? {
          startedAt: now,
          count: 0,
        };

      if (
        now -
          record.startedAt >=
        60_000
      ) {
        record.startedAt = now;
        record.count = 0;
      }

      record.count += 1;
      attempts.set(
        key,
        record,
      );

      if (
        record.count > 120
      ) {
        response
          .status(429)
          .set(
            'Retry-After',
            '60',
          )
          .json({
            error:
              'Installer request rate limit exceeded',
          });
        return;
      }

      next();
    },
  );

  app.use(
    base + '/api',
    express.json({
      limit: '1mb',
    }),
  );

  app.get(
    base + '/',
    async (
      request,
      response,
      next,
    ) => {
      try {
        const template =
          await fs.readFile(
            path.join(
              installDirectory,
              'index.html',
            ),
            'utf8',
          );

        const secure =
          request.secure;
        response.set(
          'Set-Cookie',
          'dtpstat_install_session=' +
            encodeURIComponent(
              installState
                .sessionToken,
            ) +
            '; Path=' +
            base +
            '; HttpOnly; SameSite=Strict' +
            (
              secure
                ? '; Secure'
                : ''
            ),
        );

        response
          .type('html')
          .send(
            template
              .replaceAll(
                '{{INSTALL_BASE}}',
                base,
              )
              .replaceAll(
                '{{INSTALL_CSRF}}',
                installState
                  .csrfToken,
              ),
          );
      } catch (error) {
        next(error);
      }
    },
  );

  for (
    const fileName of [
      'install.css',
      'install.js',
    ]
  ) {
    app.get(
      base +
        '/' +
        fileName,
      (
        _request,
        response,
      ) => {
        response.sendFile(
          fileName,
          {
            root:
              installDirectory,
          },
        );
      },
    );
  }

  app.use(
    base + '/api',
    (
      request,
      response,
      next,
    ) => {
      if (
        cookieValue(
          request,
          'dtpstat_install_session',
        ) !==
        installState
          .sessionToken
      ) {
        response
          .status(404)
          .json({
            error:
              'Not found',
          });
        return;
      }

      if (
        request.method !==
          'GET'
      ) {
        if (
          request.get(
            'x-install-csrf',
          ) !==
          installState
            .csrfToken
        ) {
          response
            .status(403)
            .json({
              error:
                'Installer CSRF validation failed',
            });
          return;
        }

        const suppliedOrigin =
          request.get(
            'origin',
          );
        const expectedOrigin =
          requestOrigin(
            request,
          );

        if (
          !suppliedOrigin ||
          suppliedOrigin !==
            expectedOrigin
        ) {
          response
            .status(403)
            .json({
              error:
                'Installer origin is not allowed',
            });
          return;
        }
      }

      next();
    },
  );

  app.get(
    base + '/api/state',
    (
      request,
      response,
    ) => {
      response.json({
        state:
          service.state(),
        observed: {
          origin:
            requestOrigin(
              request,
            ),
          secure:
            request.secure ===
            true,
          forwardedProto:
            request.get(
              'x-forwarded-proto',
            ) ??
            null,
        },
      });
    },
  );

  function post(
    route,
    handler,
  ) {
    app.post(
      base +
        '/api/' +
        route,
      async (
        request,
        response,
        next,
      ) => {
        try {
          response.json(
            await handler(
              request.body ??
              {},
            ),
          );
        } catch (error) {
          next(error);
        }
      },
    );
  }

  post(
    'environment',
    service
      .configureEnvironment,
  );
  post(
    'database/test',
    service.testPostgres,
  );
  post(
    'database/configure',
    service
      .configureDatabase,
  );
  post(
    'database/provision',
    () =>
      service.provision(),
  );
  post(
    'administrator',
    service
      .configureAdministrator,
  );
  post(
    'project',
    service.configureProject,
  );
  post(
    'runtime',
    service.configureRuntime,
  );

  app.post(
    base + '/api/finish',
    async (
      _request,
      response,
      next,
    ) => {
      try {
        const result =
          await service.finish();
        response.json(
          result,
        );
        setTimeout(
          () => {
            onComplete(
              result,
            );
          },
          250,
        ).unref?.();
      } catch (error) {
        next(error);
      }
    },
  );

  app.use(
    (
      error,
      _request,
      response,
      _next,
    ) => {
      const status =
        Number(
          error?.statusCode,
        ) ||
        400;

      response
        .status(
          status >= 400 &&
          status <= 599
            ? status
            : 500,
        )
        .json({
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
    },
  );

  return {
    app,
    base,
  };
}
