import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  renderManagedEnvironment,
  updateEnvironmentFile,
} from '../scripts/install/env-file.js';

test('installer env writer preserves unrelated settings and removes bootstrap secrets', async () => {
  const directory =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        'dtpstat-install-env-',
      ),
    );
  const filePath =
    path.join(
      directory,
      '.env',
    );

  try {
    await fs.writeFile(
      filePath,
      [
        'UNRELATED="keep-me"',
        'DATABASE_NAME="old"',
        'POSTGRES_ADMIN_PASSWORD="must-go"',
        'IMPORT_API_PASSWORD="must-go-too"',
        '',
      ].join('\n'),
      {
        mode: 0o600,
      },
    );

    const result =
      await updateEnvironmentFile({
        filePath,
        values: {
          DATABASE_NAME: 'new_db',
          ADMIN_ALLOWED_ORIGINS:
            'https://example.test',
        },
        removeKeys: [
          'POSTGRES_ADMIN_PASSWORD',
          'IMPORT_API_PASSWORD',
        ],
        now: () => 42,
      });

    const saved =
      await fs.readFile(
        filePath,
        'utf8',
      );

    assert.match(
      saved,
      /UNRELATED="keep-me"/u,
    );
    assert.match(
      saved,
      /DATABASE_NAME="new_db"/u,
    );
    assert.match(
      saved,
      /ADMIN_ALLOWED_ORIGINS="https:\/\/example\.test"/u,
    );
    assert.doesNotMatch(
      saved,
      /POSTGRES_ADMIN_PASSWORD/u,
    );
    assert.doesNotMatch(
      saved,
      /IMPORT_API_PASSWORD/u,
    );
    assert.ok(
      result.backupPath
        .endsWith(
          '.pre-install-42',
        ),
    );
    await fs.access(
      result.backupPath,
    );
  } finally {
    await fs.rm(
      directory,
      {
        recursive: true,
        force: true,
      },
    );
  }
});

test('installer managed env renderer quotes values and rejects multiline input', () => {
  assert.equal(
    renderManagedEnvironment({
      KEY: 'a b',
    }),
    '# Managed by DTP-Stat install wizard\nKEY="a b"\n',
  );

  assert.throws(
    () =>
      renderManagedEnvironment({
        KEY: 'a\nb',
      }),
    /single-line/u,
  );
});
