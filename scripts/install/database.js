import pg from 'pg';
import {
  databaseApplicationName,
  loadApplicationDatabaseConnection,
  loadMigrationDatabaseConnection,
  normalizeDatabaseSchema,
} from '../../src/db/database-environment.js';
import {
  createPool,
} from '../../src/db/pool.js';
import {
  migrateDatabase,
} from '../../src/db/migration-runner.js';
import {
  verifyDatabaseMigrationState,
} from '../../src/db/migration-state.js';
import {
  initializeDatabase,
} from '../init-database.js';

const { Client } = pg;

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

function databaseIdentifier(
  value,
  label,
) {
  const normalized =
    required(
      value,
      label,
    );

  if (
    !/^[a-z_][a-z0-9_]{0,62}$/u
      .test(normalized)
  ) {
    throw new Error(
      label +
        ' must be a lower-case PostgreSQL identifier',
    );
  }

  return normalized;
}

export function normalizePostgresAdminInput(
  input,
) {
  const password =
    String(
      input?.password ??
      '',
    );

  if (!password.trim()) {
    throw new Error(
      'PostgreSQL password is required',
    );
  }

  return {
    host:
      required(
        input?.host ??
          '127.0.0.1',
        'PostgreSQL host',
      ),
    port:
      integer(
        input?.port ?? 5432,
        'PostgreSQL port',
        1,
        65535,
      ),
    database:
      required(
        input?.database ??
          'postgres',
        'PostgreSQL administrative database',
      ),
    user: 'postgres',
    password,
    ssl:
      input?.ssl === true
        ? {
            rejectUnauthorized:
              input
                ?.rejectUnauthorized !==
              false,
          }
        : false,
  };
}

export async function testPostgresAdminConnection(
  input,
  {
    ClientClass = Client,
  } = {},
) {
  const connection =
    normalizePostgresAdminInput(
      input,
    );

  const client =
    new ClientClass({
      ...connection,
      application_name:
        'dtpstat:installer-check',
      connectionTimeoutMillis:
        8_000,
    });

  await client.connect();

  try {
    const result =
      await client.query(
        `SELECT
           current_user AS "user",
           current_database() AS "database",
           current_setting('server_version') AS "serverVersion",
           EXISTS (
             SELECT 1
             FROM pg_available_extensions
             WHERE name = 'postgis'
           ) AS "postgisAvailable"`,
      );

    const row =
      result.rows[0];

    if (row?.user !== 'postgres') {
      throw new Error(
        'Installer requires the PostgreSQL postgres account',
      );
    }

    return {
      user: row.user,
      database:
        row.database,
      serverVersion:
        row.serverVersion,
      postgisAvailable:
        row.postgisAvailable ===
        true,
    };
  } finally {
    await client.end();
  }
}

export function buildProvisioningEnvironment({
  admin,
  target,
}) {
  const normalizedAdmin =
    normalizePostgresAdminInput(
      admin,
    );
  const schema =
    normalizeDatabaseSchema(
      target?.schema,
    );

  const database =
    databaseIdentifier(
      target?.database,
      'Application database',
    );
  const runtimeRole =
    databaseIdentifier(
      target?.runtimeRole,
      'Runtime role',
    );
  const migrationRole =
    databaseIdentifier(
      target?.migrationRole,
      'Migration role',
    );

  if (
    runtimeRole ===
    'postgres' ||
    migrationRole ===
    'postgres'
  ) {
    throw new Error(
      'Application roles must not be postgres',
    );
  }

  if (
    runtimeRole ===
    migrationRole
  ) {
    throw new Error(
      'Runtime and migration roles must be different',
    );
  }

  if (
    database ===
    normalizedAdmin.database
  ) {
    throw new Error(
      'Application database must differ from the administrative database',
    );
  }

  const runtimePassword =
    String(
      target?.runtimePassword ??
      '',
    );
  const migrationPassword =
    String(
      target?.migrationPassword ??
      '',
    );

  if (
    !runtimePassword.trim() ||
    !migrationPassword.trim()
  ) {
    throw new Error(
      'Runtime and migration role passwords are required',
    );
  }

  return {
    NODE_ENV: 'production',
    DATABASE_HOST:
      normalizedAdmin.host,
    DATABASE_PORT:
      String(
        normalizedAdmin.port,
      ),
    DATABASE_NAME:
      database,
    DATABASE_ROLE:
      runtimeRole,
    DATABASE_ROLE_PASSWORD:
      runtimePassword,
    DATABASE_MIGRATION_ROLE:
      migrationRole,
    DATABASE_MIGRATION_ROLE_PASSWORD:
      migrationPassword,
    DATABASE_SCHEMA:
      schema,
    DATABASE_SSL:
      normalizedAdmin.ssl
        ? 'true'
        : 'false',
    DATABASE_SSL_REJECT_UNAUTHORIZED:
      normalizedAdmin.ssl
        ?.rejectUnauthorized ===
      false
        ? 'false'
        : 'true',
    POSTGRES_ADMIN_DATABASE:
      normalizedAdmin.database,
    POSTGRES_ADMIN_USER:
      'postgres',
    POSTGRES_ADMIN_PASSWORD:
      normalizedAdmin.password,
  };
}

export async function provisionApplicationDatabase({
  env,
  projectRoot,
}) {
  const initialized =
    await initializeDatabase(
      env,
    );

  const schema =
    normalizeDatabaseSchema(
      env.DATABASE_SCHEMA,
    );
  const migrationConnection =
    loadMigrationDatabaseConnection(
      env,
    );
  const pool =
    createPool({
      ...migrationConnection,
      schema,
      maxConnections: 1,
      applicationNameComponent:
        'installer-migrations',
    });

  try {
    const migrated =
      await migrateDatabase(
        pool,
        {
          projectRoot,
          schema,
        },
      );
    const verified =
      await verifyDatabaseMigrationState(
        pool,
        {
          projectRoot,
          schema,
        },
      );

    return {
      initialized,
      migrated,
      verified,
    };
  } finally {
    await pool.end();
  }
}

export function createInstallerRuntimePool(
  env,
) {
  const schema =
    normalizeDatabaseSchema(
      env.DATABASE_SCHEMA,
    );
  const connection =
    loadApplicationDatabaseConnection(
      env,
    );

  return createPool({
    ...connection,
    schema,
    maxConnections: 2,
    applicationNameComponent:
      'installer-runtime',
  });
}

export function installerDatabaseSummary(
  env,
) {
  return {
    host:
      env.DATABASE_HOST,
    port:
      Number(
        env.DATABASE_PORT,
      ),
    database:
      env.DATABASE_NAME,
    schema:
      env.DATABASE_SCHEMA,
    runtimeRole:
      env.DATABASE_ROLE,
    migrationRole:
      env.DATABASE_MIGRATION_ROLE,
    applicationName:
      databaseApplicationName(
        env.DATABASE_SCHEMA,
        'installer',
      ),
  };
}
