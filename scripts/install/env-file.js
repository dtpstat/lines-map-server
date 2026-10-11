import fs from 'node:fs/promises';
import path from 'node:path';

const KEY_PATTERN =
  /^[A-Z][A-Z0-9_]*$/u;

function quoteValue(value) {
  const stringValue =
    String(value ?? '');

  if (/[\r\n\0]/u.test(stringValue)) {
    throw new Error(
      'Environment values must be single-line strings',
    );
  }

  return (
    '"' +
    stringValue
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"') +
    '"'
  );
}

export function renderManagedEnvironment(
  values,
) {
  const lines = [
    '# Managed by DTP-Stat install wizard',
  ];

  for (
    const [
      key,
      value,
    ] of Object.entries(values)
  ) {
    if (!KEY_PATTERN.test(key)) {
      throw new Error(
        'Invalid environment key: ' +
          key,
      );
    }

    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    lines.push(
      key +
        '=' +
        quoteValue(value),
    );
  }

  return lines.join('\n') + '\n';
}

export async function updateEnvironmentFile({
  filePath,
  values,
  removeKeys = [],
  now = () => Date.now(),
}) {
  let existing = '';

  try {
    existing =
      await fs.readFile(
        filePath,
        'utf8',
      );
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  const keys =
    new Set([
      ...Object.keys(values),
      ...removeKeys,
    ]);
  const retained =
    existing
      .split(/\r?\n/u)
      .filter(
        (line) => {
          const match =
            /^([A-Z][A-Z0-9_]*)=/u
              .exec(line);
          return (
            !match ||
            !keys.has(
              match[1],
            )
          );
        },
      );

  while (
    retained.length > 0 &&
    retained.at(-1) === ''
  ) {
    retained.pop();
  }

  const managed =
    renderManagedEnvironment(
      values,
    ).trimEnd();

  const output =
    (
      retained.length > 0
        ? retained.join('\n') +
          '\n\n'
        : ''
    ) +
    managed +
    '\n';

  await fs.mkdir(
    path.dirname(filePath),
    {
      recursive: true,
    },
  );

  let backupPath = null;

  if (existing) {
    backupPath =
      filePath +
      '.pre-install-' +
      now();

    await fs.copyFile(
      filePath,
      backupPath,
    );
    await fs.chmod(
      backupPath,
      0o600,
    );
  }

  const temporary =
    filePath +
    '.tmp-' +
    process.pid;

  await fs.writeFile(
    temporary,
    output,
    {
      mode: 0o600,
    },
  );
  await fs.rename(
    temporary,
    filePath,
  );
  await fs.chmod(
    filePath,
    0o600,
  );

  return {
    backupPath,
    keys:
      Object.keys(values)
        .sort(),
    removedKeys:
      [...removeKeys]
        .sort(),
  };
}
