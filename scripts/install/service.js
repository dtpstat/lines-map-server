import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import {
  loadConfig,
} from '../../src/config.js';
import {
  createProjectSettingsRuntime,
} from '../../src/application/project-runtime.js';
import {
  createSecurityRuntime,
} from '../../src/application/security-runtime.js';
import {
  normalizePublicThemePreset,
} from '../../src/modules/project/settings-policy.js';
import {
  buildProvisioningEnvironment,
  createInstallerRuntimePool,
  installerDatabaseSummary,
  provisionApplicationDatabase,
  testPostgresAdminConnection,
} from './database.js';
import {
  updateEnvironmentFile,
} from './env-file.js';

function cleanOrigin(value) {
  let url;

  try {
    url =
      new URL(
        String(value ?? '')
          .trim(),
      );
  } catch {
    throw new Error(
      'Public URL must be an absolute HTTPS origin',
    );
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (
      url.pathname !== '/' &&
      url.pathname !== ''
    ) ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Public URL must be an HTTPS origin without path, query or credentials',
    );
  }

  return url.origin;
}

function integer(value, label, min, max) {
  const normalized =
    Number(value);

  if (
    !Number.isInteger(normalized) ||
    normalized < min ||
    normalized > max
  ) {
    throw new Error(
      label +
        ' must be an integer between ' +
        min +
        ' and ' +
        max,
    );
  }

  return normalized;
}

function required(value, label) {
  const normalized =
    String(value ?? '')
      .trim();

  if (!normalized) {
    throw new Error(
      label + ' is required',
    );
  }

  return normalized;
}

function safeLogProjectName(value) {
  const normalized =
    required(
      value,
      'Log project name',
    );

  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u
      .test(normalized)
  ) {
    throw new Error(
      'Log project name may contain only ASCII letters, digits, dot, underscore and dash',
    );
  }

  return normalized;
}

function randomSecret(bytes = 24) {
  return crypto
    .randomBytes(bytes)
    .toString('base64url');
}

function publicProjectPayload(
  current,
  {
    projectName,
    themePreset,
    mapboxAccessToken,
  },
) {
  return {
    projectName:
      required(
        projectName,
        'Project name',
      ),
    keywords:
      current.keywords ??
      [],
    footerHtml:
      current.footerHtml ??
      '<p>Информация о проекте.</p>',
    yandexMetrikaId:
      current.yandexMetrikaId ??
      null,
    googleAnalyticsId:
      current.googleAnalyticsId ??
      null,
    themePreset:
      normalizePublicThemePreset(
        themePreset,
      ),
    showLineLabels:
      current.showLineLabels ===
      true,
    showLinePopups:
      current.showLinePopups !==
      false,
    showGeometryTimeline:
      current.showGeometryTimeline ===
      true,
    historyStartDate:
      current.historyStartDate ??
      null,
    historySpeeds:
      Array.isArray(
        current.historySpeeds,
      )
        ? current.historySpeeds
          .map(
            (speed) => ({
              name:
                speed.name,
              stepUnit:
                speed.stepUnit,
              intervalSeconds:
                speed.intervalSeconds,
              isActive:
                speed.isActive !==
                false,
              isDefault:
                speed.isDefault ===
                true,
            }),
          )
        : undefined,
    showPointGeometries:
      current.showPointGeometries !==
      false,
    showLineGeometries:
      current.showLineGeometries !==
      false,
    showPolygonGeometries:
      current.showPolygonGeometries !==
      false,
    mapboxAccessToken:
      String(
        mapboxAccessToken ??
        '',
      ).trim() ||
      null,
    largeCityPopulationThreshold:
      current
        .largeCityPopulationThreshold ??
      400000,
    largeCityAreaKm2Threshold:
      current
        .largeCityAreaKm2Threshold ??
      null,
    fileLoggingEnabled:
      current.fileLoggingEnabled,
    fileLogRotateMaxSizeMb:
      current.fileLogRotateMaxSizeMb,
    fileLogRotateInterval:
      current.fileLogRotateInterval,
    fileLogRetentionDays:
      current.fileLogRetentionDays,
    fileLogMaxArchives:
      current.fileLogMaxArchives,
    fileLogCompress:
      current.fileLogCompress,
  };
}

export function createInstallService({
  projectRoot,
  state,
  databaseTest =
    testPostgresAdminConnection,
  provisionDatabase =
    provisionApplicationDatabase,
  writeEnvironment =
    updateEnvironmentFile,
} = {}) {
  if (
    !projectRoot ||
    !state
  ) {
    throw new TypeError(
      'projectRoot and state are required',
    );
  }

  const draft = {
    environment: null,
    postgres: null,
    database: null,
    provisioningEnv: null,
    databaseProvisioned:
      false,
    administrator:
      false,
    project:
      false,
    runtime: null,
  };

  function assertActive() {
    state.assertActive();
  }

  function sanitizedState() {
    return {
      routeId:
        state.routeId,
      expiresAt:
        new Date(
          state.expiresAt,
        ).toISOString(),
      steps: {
        environment:
          Boolean(
            draft.environment,
          ),
        postgres:
          Boolean(
            draft.postgres,
          ),
        database:
          draft.databaseProvisioned,
        administrator:
          draft.administrator,
        project:
          draft.project,
        runtime:
          Boolean(
            draft.runtime,
          ),
      },
      environment:
        draft.environment,
      database:
        draft.provisioningEnv
          ? installerDatabaseSummary(
              draft.provisioningEnv,
            )
          : null,
      runtime:
        draft.runtime
          ? {
              fileLogRootDir:
                draft.runtime
                  .fileLogRootDir,
              fileLogProjectName:
                draft.runtime
                  .fileLogProjectName,
              mapboxStyleUrl:
                draft.runtime
                  .mapboxStyleUrl,
            }
          : null,
    };
  }

  async function configureEnvironment(
    input,
  ) {
    assertActive();

    draft.environment = {
      publicOrigin:
        cleanOrigin(
          input?.publicOrigin,
        ),
      host:
        required(
          input?.host ??
            '127.0.0.1',
          'Node bind host',
        ),
      httpPort:
        integer(
          input?.httpPort ??
            3000,
          'HTTP port',
          1,
          65535,
        ),
      trustProxyHops:
        integer(
          input
            ?.trustProxyHops ??
            1,
          'Trusted proxy hops',
          0,
          16,
        ),
    };

    return sanitizedState();
  }

  async function testPostgres(
    input,
  ) {
    assertActive();
    return databaseTest(
      input,
    );
  }

  async function configureDatabase(
    input,
  ) {
    assertActive();

    const admin = {
      host:
        input?.admin?.host,
      port:
        input?.admin?.port,
      database:
        input?.admin?.database,
      password:
        input?.admin?.password,
      ssl:
        input?.admin?.ssl,
      rejectUnauthorized:
        input?.admin
          ?.rejectUnauthorized,
    };

    await databaseTest(
      admin,
    );

    draft.postgres =
      admin;
    draft.database = {
      database:
        input?.target?.database,
      schema:
        input?.target?.schema,
      runtimeRole:
        input?.target
          ?.runtimeRole,
      runtimePassword:
        input?.target
          ?.runtimePassword,
      migrationRole:
        input?.target
          ?.migrationRole,
      migrationPassword:
        input?.target
          ?.migrationPassword,
    };

    draft.provisioningEnv =
      buildProvisioningEnvironment({
        admin:
          draft.postgres,
        target:
          draft.database,
      });

    draft.databaseProvisioned =
      false;

    return sanitizedState();
  }

  async function provision() {
    assertActive();

    if (
      !draft.provisioningEnv
    ) {
      throw new Error(
        'Database configuration must be completed first',
      );
    }

    const result =
      await provisionDatabase({
        env:
          draft.provisioningEnv,
        projectRoot,
      });

    draft.databaseProvisioned =
      true;

    return {
      state:
        sanitizedState(),
      result: {
        database:
          installerDatabaseSummary(
            draft.provisioningEnv,
          ),
        migrationVersion:
          result.migrated
            ?.version ??
          result.verified
            ?.version ??
          null,
        appliedMigrations:
          result.migrated
            ?.appliedCount ??
          null,
        postgis:
          result.initialized
            ?.postgis ??
          null,
      },
    };
  }

  async function configureAdministrator(
    input,
  ) {
    assertActive();

    if (
      !draft.databaseProvisioned
    ) {
      throw new Error(
        'Database must be provisioned first',
      );
    }

    const username =
      required(
        input?.username ??
          'admin',
        'Administrator login',
      );
    const password =
      String(
        input?.password ??
        '',
      );

    if (
      password.length < 12
    ) {
      throw new Error(
        'Administrator password must contain at least 12 characters',
      );
    }

    const pool =
      createInstallerRuntimePool(
        draft.provisioningEnv,
      );

    try {
      const {
        securityService,
      } =
        createSecurityRuntime(
          pool,
        );
      const result =
        await securityService
          .bootstrap({
            username,
            password,
          });

      if (
        result.created !==
          true
      ) {
        throw new Error(
          'Administrator table is not empty; use recovery tooling instead of the initial installer',
        );
      }
    } finally {
      await pool.end();
    }

    draft.administrator =
      true;

    return sanitizedState();
  }

  async function configureProject(
    input,
  ) {
    assertActive();

    if (!draft.administrator) {
      throw new Error(
        'Administrator must be created first',
      );
    }

    const pool =
      createInstallerRuntimePool(
        draft.provisioningEnv,
      );

    try {
      const repository =
        createProjectSettingsRuntime(
          pool,
          {
            styleUrl:
              String(
                input
                  ?.mapboxStyleUrl ??
                '',
              ).trim() ||
              'mapbox://styles/mapbox/streets-v12',
            initialCenter: [
              37.6173,
              55.7558,
            ],
            initialZoom: 4,
          },
        );
      const current =
        await repository.get();

      await repository.save(
        publicProjectPayload(
          current,
          input,
        ),
      );
    } finally {
      await pool.end();
    }

    draft.project = true;
    draft.projectValues = {
      projectName:
        required(
          input?.projectName,
          'Project name',
        ),
      themePreset:
        normalizePublicThemePreset(
          input?.themePreset,
        ),
      mapboxStyleUrl:
        String(
          input
            ?.mapboxStyleUrl ??
          '',
        ).trim() ||
        'mapbox://styles/mapbox/streets-v12',
    };

    return sanitizedState();
  }

  async function configureRuntime(
    input,
  ) {
    assertActive();

    const root =
      path.resolve(
        String(
          input
            ?.fileLogRootDir ??
          '/var/log',
        ),
      );

    if (
      !path.isAbsolute(root)
    ) {
      throw new Error(
        'Log root must be an absolute path',
      );
    }

    const projectName =
      safeLogProjectName(
        input
          ?.fileLogProjectName ??
        draft.provisioningEnv
          ?.DATABASE_SCHEMA,
      );

    let directoryReady = false;

    try {
      await fs.access(
        path.join(
          root,
          projectName,
        ),
        fsConstants.W_OK,
      );
      directoryReady = true;
    } catch {
      directoryReady = false;
    }

    draft.runtime = {
      fileLogRootDir: root,
      fileLogProjectName:
        projectName,
      mapboxStyleUrl:
        String(
          input?.mapboxStyleUrl ??
          draft.projectValues
            ?.mapboxStyleUrl ??
          'mapbox://styles/mapbox/streets-v12',
        ).trim(),
      mfaEncryptionKey:
        String(
          input
            ?.mfaEncryptionKey ??
          '',
        ).trim() ||
        randomSecret(32),
      directoryReady,
      directoryCommand:
        'sudo install -d -o ' +
        (input?.serviceUser ??
          'dtpstat') +
        ' -g ' +
        (input?.serviceGroup ??
          'dtpstat') +
        ' -m 0750 ' +
        path.join(
          root,
          projectName,
        ),
    };

    return {
      state:
        sanitizedState(),
      generatedMfaKey:
        input?.mfaEncryptionKey
          ? null
          : draft.runtime
            .mfaEncryptionKey,
      directoryReady,
      directoryCommand:
        draft.runtime
          .directoryCommand,
    };
  }

  function finalEnvironment() {
    if (
      !draft.environment ||
      !draft.databaseProvisioned ||
      !draft.administrator ||
      !draft.project ||
      !draft.runtime
    ) {
      throw new Error(
        'Every installation step must be completed before finish',
      );
    }

    return {
      NODE_ENV: 'production',
      HOST:
        draft.environment.host,
      HTTP_ENABLED: 'true',
      HTTP_PORT:
        String(
          draft.environment
            .httpPort,
        ),
      HTTP_TRUST_PROXY_HOPS:
        String(
          draft.environment
            .trustProxyHops,
        ),
      ADMIN_ALLOWED_ORIGINS:
        draft.environment
          .publicOrigin,
      HTTPS_ENABLED: 'false',
      DATABASE_HOST:
        draft.provisioningEnv
          .DATABASE_HOST,
      DATABASE_PORT:
        draft.provisioningEnv
          .DATABASE_PORT,
      DATABASE_NAME:
        draft.provisioningEnv
          .DATABASE_NAME,
      DATABASE_ROLE:
        draft.provisioningEnv
          .DATABASE_ROLE,
      DATABASE_ROLE_PASSWORD:
        draft.provisioningEnv
          .DATABASE_ROLE_PASSWORD,
      DATABASE_MIGRATION_ROLE:
        draft.provisioningEnv
          .DATABASE_MIGRATION_ROLE,
      DATABASE_MIGRATION_ROLE_PASSWORD:
        draft.provisioningEnv
          .DATABASE_MIGRATION_ROLE_PASSWORD,
      DATABASE_SCHEMA:
        draft.provisioningEnv
          .DATABASE_SCHEMA,
      DATABASE_SSL:
        draft.provisioningEnv
          .DATABASE_SSL,
      DATABASE_SSL_REJECT_UNAUTHORIZED:
        draft.provisioningEnv
          .DATABASE_SSL_REJECT_UNAUTHORIZED,
      DATABASE_POOL_MAX: '10',
      ADMIN_MFA_ENCRYPTION_KEY:
        draft.runtime
          .mfaEncryptionKey,
      FILE_LOG_ROOT_DIR:
        draft.runtime
          .fileLogRootDir,
      FILE_LOG_PROJECT_NAME:
        draft.runtime
          .fileLogProjectName,
      MAPBOX_STYLE_URL:
        draft.runtime
          .mapboxStyleUrl,
      METRICS_ENABLED: 'false',
    };
  }

  async function finish() {
    assertActive();

    const env =
      finalEnvironment();

    // Validate the exact deployment values before they are persisted.
    loadConfig(
      {
        ...process.env,
        ...env,
      },
      projectRoot,
    );

    const fileResult =
      await writeEnvironment({
        filePath:
          path.join(
            projectRoot,
            '.env',
          ),
        values: env,
        removeKeys: [
          'POSTGRES_ADMIN_DATABASE',
          'POSTGRES_ADMIN_USER',
          'POSTGRES_ADMIN_PASSWORD',
          'IMPORT_API_USERNAME',
          'IMPORT_API_PASSWORD',
          'MAPBOX_ACCESS_TOKEN',
        ],
      });

    await state.complete({
      database:
        env.DATABASE_NAME,
      schema:
        env.DATABASE_SCHEMA,
      publicOrigin:
        env.ADMIN_ALLOWED_ORIGINS,
    });

    return {
      completed: true,
      environmentFile:
        path.join(
          projectRoot,
          '.env',
        ),
      backupPath:
        fileResult.backupPath,
      managedKeys:
        fileResult.keys,
      publicOrigin:
        env.ADMIN_ALLOWED_ORIGINS,
      database:
        installerDatabaseSummary(
          env,
        ),
      logDirectory:
        path.join(
          env.FILE_LOG_ROOT_DIR,
          env.FILE_LOG_PROJECT_NAME,
        ),
      logDirectoryReady:
        draft.runtime
          .directoryReady,
      logDirectoryCommand:
        draft.runtime
          .directoryCommand,
      nextCommand:
        'npm start',
    };
  }

  return {
    state: sanitizedState,
    configureEnvironment,
    testPostgres,
    configureDatabase,
    provision,
    configureAdministrator,
    configureProject,
    configureRuntime,
    finish,
  };
}
