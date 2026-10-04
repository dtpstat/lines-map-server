import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  readdir,
  utimes,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createProjectFileLogger,
} from '../src/observability/project-file-logger.js';

test('project file logger writes error and security JSONL into a pre-created directory', async () => {
  const directory =
    await mkdtemp(
      path.join(
        os.tmpdir(),
        'dtpstat-log-',
      ),
    );
  const logger =
    createProjectFileLogger({
      directory,
      output: {
        error() {},
      },
    });

  const status =
    await logger.configure({
      fileLoggingEnabled: true,
      fileLogRotateMaxSizeMb: 50,
      fileLogRotateInterval: 'daily',
      fileLogRetentionDays: 30,
      fileLogMaxArchives: 30,
      fileLogCompress: true,
    });
  assert.equal(status.operational, true);

  logger.write('error', {
    timestamp: '2026-10-04T10:00:00.000Z',
    event: 'test.error',
  });
  logger.write('security', {
    timestamp: '2026-10-04T10:00:00.000Z',
    event: 'test.security',
  });
  await logger.flush();

  const errorLine =
    await readFile(
      path.join(directory, 'errors.log'),
      'utf8',
    );
  const securityLine =
    await readFile(
      path.join(directory, 'security.log'),
      'utf8',
    );

  assert.equal(JSON.parse(errorLine).event, 'test.error');
  assert.equal(JSON.parse(securityLine).event, 'test.security');
});

test('project file logger rotates on calendar interval and compresses archives', async () => {
  const directory =
    await mkdtemp(
      path.join(
        os.tmpdir(),
        'dtpstat-rotate-',
      ),
    );
  const current =
    new Date('2026-10-05T00:00:00.000Z');
  const logger =
    createProjectFileLogger({
      directory,
      now: () => current,
      output: {
        error() {},
      },
    });

  await logger.configure({
    fileLoggingEnabled: true,
    fileLogRotateMaxSizeMb: 50,
    fileLogRotateInterval: 'daily',
    fileLogRetentionDays: 30,
    fileLogMaxArchives: 30,
    fileLogCompress: true,
  });

  const active =
    path.join(directory, 'errors.log');
  await writeFile(
    active,
    '{"old":true}\n',
    {
      mode: 0o640,
    },
  );
  const old =
    new Date('2026-10-04T12:00:00.000Z');
  await utimes(active, old, old);

  logger.write('error', {
    timestamp: current.toISOString(),
    event: 'new',
  });
  await logger.flush();

  const names =
    await readdir(directory);
  assert.ok(names.includes('errors.log'));
  assert.ok(
    names.some(
      (name) =>
        name.startsWith('errors.log.20261005T000000Z') &&
        name.endsWith('.gz'),
    ),
  );
});
