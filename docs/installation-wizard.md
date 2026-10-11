# Initial installation wizard

Для нового экземпляра предпочтителен одноразовый пошаговый мастер:

```bash
npm ci
npm run setup
```

Он является deployment tooling, а не частью обычного public/admin runtime.
После установки запускается штатный `npm start`.

## Почему отдельный installer

Обычный server intentionally требует уже валидные production settings и
database roles. Installer должен работать раньше них: application database,
schema и роли могут ещё не существовать, поэтому первичная PostgreSQL проверка
выполняется только под административной учётной записью `postgres`.

Installer не ослабляет production admin CSRF/origin policy и не создаёт
fallback login.

## Одноразовый URL и состояние

Каждый запуск создаёт cryptographically random route:

```text
/install-<32 hex chars>/
```

Дополнительные границы:

- отдельный случайный HttpOnly `SameSite=Strict` session cookie;
- отдельный CSRF token;
- mutating requests требуют exact same-origin;
- in-memory IP rate limit;
- TTL, по умолчанию 60 минут;
- `Cache-Control: no-store`;
- installer по умолчанию bind-ится только к `127.0.0.1`;
- при loopback bind installer по умолчанию доверяет одному локальному reverse
  proxy hop, чтобы HTTPS nginx корректно передавал protocol; при non-loopback
  bind default остаётся 0.

Runtime metadata создаётся в:

```text
var/install-<suffix>/state.json
```

В нём нет password/session/CSRF secrets. После успешного finish каталог
удаляется. Остаётся только non-secret marker:

```text
var/install-completed.json
```

Наличие marker запрещает новый initial installer. Для deliberate recovery
используются штатные recovery commands; удалять marker автоматически нельзя.

Исходный UI/code в version-controlled каталоге `install/` не является
runtime state и не self-delete-ится.

## Шаги

1. **Адрес и proxy** — public HTTPS origin, Node bind host/port,
   `HTTP_TRUST_PROXY_HOPS`; UI показывает observed protocol/origin и
   `X-Forwarded-Proto`.
2. **PostgreSQL** — host/port/admin database/password. User жёстко равен
   `postgres`; кнопка **Проверить подключение** работает до создания
   application DB/roles.
3. **База приложения** — `DATABASE_NAME`, `DATABASE_SCHEMA`, отдельные
   runtime/migration roles и passwords. Выполняются DB init, PostGIS,
   migrations и privilege verification.
4. **Администратор** — первый protected bootstrap-superuser.
5. **Проект** — project name, `retro/classic/modern`, Mapbox access token и
   style URL. Access token сразу становится DB-backed project setting.
6. **Система** — file-log namespace/root и stable 32-byte MFA encryption key.
7. **Проверка** — полный `loadConfig` readback, backup существующего
   `.env`, atomic write и уничтожение install state.

## Secrets

В памяти installer временно находятся PostgreSQL superuser password,
application role passwords и первый admin password.

В итоговый `.env` **не записываются**:

```text
POSTGRES_ADMIN_PASSWORD
POSTGRES_ADMIN_USER
POSTGRES_ADMIN_DATABASE
IMPORT_API_USERNAME
IMPORT_API_PASSWORD
MAPBOX_ACCESS_TOKEN
```

Application runtime/migration role passwords должны остаться deployment
secrets и поэтому сохраняются в `.env`. Mapbox access token переносится в
PostgreSQL. Admin password хранится только как scrypt hash в DB.

При существующем `.env` мастер сначала создаёт backup
`.env.pre-install-<timestamp>`, затем пишет новый файл atomic rename с mode
`0600`. Backup сохраняет исходное содержимое и поэтому может содержать старые
deployment secrets; после проверки нового инстанса оператор должен удалить
ненужный backup.

## Reverse proxy

Для обычного одного nginx:

```text
HTTP_TRUST_PROXY_HOPS=1
ADMIN_ALLOWED_ORIGINS=https://hist.example.com
```

nginx должен передавать:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

Если nginx уже проксирует будущий application port, installer можно запустить
на нём же, пока обычный server остановлен:

```bash
INSTALL_PORT=3002 \
INSTALL_TRUST_PROXY_HOPS=1 \
INSTALL_PUBLIC_ORIGIN=https://hist.example.com \
npm run setup
```

`INSTALL_PUBLIC_ORIGIN` нужен только для удобного URL в terminal; canonical
production origin всё равно подтверждается пользователем на первом шаге.

## File logging

Installer проверяет существование/writeability
`FILE_LOG_ROOT_DIR/FILE_LOG_PROJECT_NAME`. Если service user ещё не имеет
каталога, UI показывает точную внешнюю команду вида:

```bash
sudo install -d -o dtpstat -g dtpstat -m 0750 /var/log/<instance>
```

Installer не повышает privileges и сам не запускает `sudo`.

## Recovery

Wizard предназначен только для initial provisioning. Если DB уже содержит
admin users, шаг bootstrap administrator завершается ошибкой вместо изменения
существующей identity.

Для recovery используются существующие инструменты, например:

```bash
npm run admin:set-superuser
npm run admin:unblock
npm run db:init
npm run db:migrate
```

Повтор initial setup требует осознанного удаления completion marker оператором;
это не является обычной процедурой обновления.
