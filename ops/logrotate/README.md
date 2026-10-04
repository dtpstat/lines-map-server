# DTP-Stat file logging and logrotate

When enabled in **Настройка интерфейса → Проект → Логирование**, DTP-Stat
writes two structured JSONL files:

- `errors.log` — application/service errors and failed administrative
  operations;
- `security.log` — security violations using the existing
  `DTPSTAT_SECURITY_V1` marker pipeline.

The built-in application rotation is authoritative. It supports size-based
rotation, daily/weekly calendar rotation, retention days, maximum archive
count, and optional gzip compression.

The log directory is deployment-local and is never created by the Node
process. `FILE_LOG_PROJECT_NAME` defaults to `DATABASE_SCHEMA`:

```text
/var/log/<FILE_LOG_PROJECT_NAME>
```

Example:

```bash
sudo install -d -o dtpstat -g dtpstat -m 0750 /var/log/buslanes
```

Active files are created with mode `0640`.

## Optional external safety net

Install a project-specific copy of `dtpstat-project.conf.example`:

```bash
sudo install -m 0644 \
  ops/logrotate/dtpstat-project.conf.example \
  /etc/logrotate.d/dtpstat-buslanes
sudo editor /etc/logrotate.d/dtpstat-buslanes
sudo logrotate --debug /etc/logrotate.d/dtpstat-buslanes
```

Replace the placeholders first. The template is intentionally looser than the
admin-configured application policy.

The app uses `appendFile()` for each JSONL record and does not retain a file
descriptor between writes. External logrotate can therefore rename the active
file normally; `copytruncate`, SIGHUP and application restart are not needed.

A missing or non-writable directory never stops the application. The failure is
reported to stderr/journald and the DB/journald audit paths remain available.

File-logging settings are deployment-local and are intentionally excluded from
project settings export/import.
