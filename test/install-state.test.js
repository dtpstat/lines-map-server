import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createInstallState,
} from '../scripts/install/state.js';

test('installer state uses a random runtime directory and removes it on completion', async () => {
  const projectRoot =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        'dtpstat-install-state-',
      ),
    );

  try {
    let now =
      Date.parse(
        '2026-10-12T00:00:00Z',
      );
    const state =
      await createInstallState({
        projectRoot,
        ttlMs: 60_000,
        now: () => now,
      });

    assert.match(
      state.routeId,
      /^install-[0-9a-f]{32}$/u,
    );
    assert.notEqual(
      state.sessionToken,
      state.csrfToken,
    );

    const runtimeState =
      JSON.parse(
        await fs.readFile(
          path.join(
            state.runtimeDirectory,
            'state.json',
          ),
          'utf8',
        ),
      );

    assert.equal(
      runtimeState.routeId,
      state.routeId,
    );
    assert.equal(
      Object.hasOwn(
        runtimeState,
        'sessionToken',
      ),
      false,
    );

    await state.complete({
      database: 'example',
      schema: 'example',
      publicOrigin:
        'https://example.test',
    });

    await assert.rejects(
      fs.access(
        state.runtimeDirectory,
      ),
      (error) =>
        error?.code ===
        'ENOENT',
    );

    const marker =
      JSON.parse(
        await fs.readFile(
          state.markerPath,
          'utf8',
        ),
      );

    assert.equal(
      marker.database,
      'example',
    );
    assert.equal(
      marker.schema,
      'example',
    );

    await assert.rejects(
      createInstallState({
        projectRoot,
      }),
      /already completed/u,
    );

    now += 120_000;
    assert.throws(
      () =>
        state.assertActive(),
      /already completed/u,
    );
  } finally {
    await fs.rm(
      projectRoot,
      {
        recursive: true,
        force: true,
      },
    );
  }
});
