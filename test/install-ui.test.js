import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('install wizard is a seven-step self-hosted modern UI', async () => {
  const [
    html,
    css,
    client,
    pkg,
  ] = await Promise.all([
    fs.readFile(
      'install/index.html',
      'utf8',
    ),
    fs.readFile(
      'install/install.css',
      'utf8',
    ),
    fs.readFile(
      'install/install.js',
      'utf8',
    ),
    fs.readFile(
      'package.json',
      'utf8',
    ),
  ]);

  assert.equal(
    (
      html.match(
        /data-step="/gu,
      ) ??
      []
    ).length,
    7,
  );
  assert.match(
    html,
    /Проверить подключение/u,
  );
  assert.match(
    html,
    /value="postgres" readonly/u,
  );
  assert.match(
    html,
    /value="retro"[sS]*value="classic"[sS]*value="modern"/u,
  );
  assert.match(
    css,
    /.installer-shell[sS]*backdrop-filter/u,
  );
  assert.match(
    css,
    /.theme-card input:checked + span/u,
  );
  assert.match(
    client,
    /database/test/u,
  );
  assert.match(
    client,
    /database/provision/u,
  );
  assert.equal(
    JSON.parse(pkg)
      .scripts.setup,
    'node scripts/install-wizard.js',
  );
  assert.doesNotMatch(
    html,
    /https?://[^"]+.(?:js|css)/u,
  );
});
