import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProvisioningEnvironment,
  normalizePostgresAdminInput,
  testPostgresAdminConnection,
} from '../scripts/install/database.js';

test('installer postgres check always uses the postgres account', async () => {
  let receivedOptions = null;
  let ended = false;

  class FakeClient {
    constructor(options) {
      receivedOptions =
        options;
    }

    async connect() {}

    async query() {
      return {
        rows: [
          {
            user: 'postgres',
            database: 'postgres',
            serverVersion: '17.6',
            postgisAvailable: true,
          },
        ],
      };
    }

    async end() {
      ended = true;
    }
  }

  const result =
    await testPostgresAdminConnection(
      {
        host: 'db.internal',
        port: 5433,
        database: 'postgres',
        password: 'secret',
        user: 'some-other-user',
      },
      {
        ClientClass:
          FakeClient,
      },
    );

  assert.equal(
    receivedOptions.user,
    'postgres',
  );
  assert.equal(
    receivedOptions.host,
    'db.internal',
  );
  assert.equal(
    receivedOptions.port,
    5433,
  );
  assert.equal(
    result.postgisAvailable,
    true,
  );
  assert.equal(
    ended,
    true,
  );
});

test('installer database plan keeps postgres secret transient and validates role separation', () => {
  const admin =
    normalizePostgresAdminInput({
      host: '127.0.0.1',
      port: 5432,
      database: 'postgres',
      password: 'postgres-secret',
    });

  const env =
    buildProvisioningEnvironment({
      admin,
      target: {
        database: 'hist_tramlanes',
        schema: 'hist_tramlanes',
        runtimeRole:
          'hist_tramlanes_app',
        runtimePassword:
          'runtime-secret',
        migrationRole:
          'hist_tramlanes_migrator',
        migrationPassword:
          'migration-secret',
      },
    });

  assert.equal(
    env.POSTGRES_ADMIN_USER,
    'postgres',
  );
  assert.equal(
    env.POSTGRES_ADMIN_PASSWORD,
    'postgres-secret',
  );
  assert.equal(
    env.DATABASE_NAME,
    'hist_tramlanes',
  );
  assert.equal(
    env.DATABASE_SCHEMA,
    'hist_tramlanes',
  );

  assert.throws(
    () =>
      buildProvisioningEnvironment({
        admin,
        target: {
          database: 'postgres',
          schema: 'example',
          runtimeRole:
            'example_app',
          runtimePassword:
            'a',
          migrationRole:
            'example_migrator',
          migrationPassword:
            'b',
        },
      }),
    /must differ/u,
  );
});
