const base =
  document
    .querySelector('meta[name="install-base"]')
    .content;
const csrf =
  document
    .querySelector('meta[name="install-csrf"]')
    .content;

const stepOrder = [
  'environment',
  'postgres',
  'database',
  'administrator',
  'project',
  'runtime',
  'finish',
];

let currentStep =
  'environment';
let serverState =
  null;
let postgresInput =
  null;
let postgresVerified =
  false;
let runtimeResult =
  null;

const $ =
  (selector) =>
    document.querySelector(selector);

function formObject(form) {
  const values =
    Object.fromEntries(
      new FormData(form)
        .entries(),
    );

  for (
    const checkbox of
    form.querySelectorAll(
      'input[type="checkbox"]',
    )
  ) {
    values[checkbox.name] =
      checkbox.checked;
  }

  return values;
}

function randomPassword() {
  const bytes =
    new Uint8Array(24);
  crypto.getRandomValues(
    bytes,
  );
  return btoa(
    String.fromCharCode(
      ...bytes,
    ),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function toast(
  message,
  error = false,
) {
  const element =
    $('#toast');
  element.textContent =
    message;
  element.hidden =
    false;
  element.classList
    .toggle(
      'is-error',
      error,
    );

  clearTimeout(
    toast.timer,
  );
  toast.timer =
    setTimeout(
      () => {
        element.hidden =
          true;
      },
      5000,
    );
}

async function api(
  route,
  options = {},
) {
  const response =
    await fetch(
      base +
        '/api/' +
        route,
      {
        credentials:
          'same-origin',
        ...options,
        headers: {
          ...(options.body
            ? {
                'Content-Type':
                  'application/json',
                'X-Install-CSRF':
                  csrf,
              }
            : {}),
          ...options.headers,
        },
      },
    );

  const payload =
    await response.json()
      .catch(
        () => ({}),
      );

  if (!response.ok) {
    throw new Error(
      payload.error ||
      'Installer request failed',
    );
  }

  return payload;
}

function setStep(name) {
  currentStep =
    name;

  for (
    const panel of
    document.querySelectorAll(
      '[data-step]',
    )
  ) {
    panel.classList
      .toggle(
        'is-active',
        panel.dataset.step ===
          name,
      );
  }

  for (
    const item of
    document.querySelectorAll(
      '[data-step-nav]',
    )
  ) {
    const step =
      item.dataset.stepNav;
    item.classList
      .toggle(
        'is-active',
        step === name,
      );
    const index =
      stepOrder.indexOf(
        step,
      );
    const currentIndex =
      stepOrder.indexOf(
        name,
      );
    item.classList
      .toggle(
        'is-done',
        index < currentIndex ||
        Boolean(
          serverState?.steps?.[
            step
          ],
        ),
      );
  }

  if (
    name === 'finish'
  ) {
    renderReview();
  }

  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  });
}

function nextStep() {
  const index =
    stepOrder.indexOf(
      currentStep,
    );
  setStep(
    stepOrder[
      Math.min(
        index + 1,
        stepOrder.length - 1,
      )
    ],
  );
}

function setBusy(
  button,
  busy,
  label,
) {
  if (!button) return;
  if (busy) {
    button.dataset
      .originalLabel =
      button.textContent;
    button.textContent =
      label ||
      'Выполняется…';
    button.disabled =
      true;
  } else {
    button.textContent =
      button.dataset
        .originalLabel ||
      button.textContent;
    button.disabled =
      false;
  }
}

function resultBox(
  selector,
  message,
  error = false,
) {
  const element =
    $(selector);
  element.hidden =
    false;
  element.textContent =
    message;
  element.classList
    .toggle(
      'is-error',
      error,
    );
  element.classList
    .toggle(
      'is-success',
      !error,
    );
}

function renderReview() {
  const grid =
    $('#review-grid');
  const database =
    serverState
      ?.database ??
    {};
  const runtime =
    serverState
      ?.runtime ??
    {};

  const entries = [
    [
      'Public origin',
      serverState
        ?.environment
        ?.publicOrigin ??
      '—',
    ],
    [
      'Node',
      (
        serverState
          ?.environment
          ?.host ??
        '—'
      ) +
        ':' +
        (
          serverState
            ?.environment
            ?.httpPort ??
          '—'
        ),
    ],
    [
      'Database',
      database.database ??
        '—',
    ],
    [
      'Schema',
      database.schema ??
        '—',
    ],
    [
      'Runtime role',
      database.runtimeRole ??
        '—',
    ],
    [
      'Migration role',
      database.migrationRole ??
        '—',
    ],
    [
      'Log root',
      runtime.fileLogRootDir ??
        '—',
    ],
    [
      'Log namespace',
      runtime.fileLogProjectName ??
        '—',
    ],
  ];

  grid.replaceChildren(
    ...entries.map(
      (
        [
          label,
          value,
        ],
      ) => {
        const card =
          document.createElement(
            'div',
          );
        card.className =
          'review-card';
        const labelNode =
          document.createElement(
            'span',
          );
        labelNode.textContent =
          label;
        const valueNode =
          document.createElement(
            'strong',
          );
        valueNode.textContent =
          value;
        card.append(
          labelNode,
          valueNode,
        );
        return card;
      },
    ),
  );
}

async function refreshState() {
  const result =
    await api('state');
  serverState =
    result.state ??
    result;

  $('#expiry').textContent =
    new Date(
      serverState.expiresAt,
    ).toLocaleString();

  const observed =
    result.observed ??
    {};
  $('#observed-origin')
    .textContent =
    observed.origin ??
    '—';
  $('#observed-secure')
    .textContent =
    observed.secure
      ? 'да'
      : 'нет';
  $('#observed-forwarded')
    .textContent =
    observed.forwardedProto ??
    '—';

  $('#global-status')
    .textContent =
    'Готов к настройке';
  $('#global-status')
    .classList
    .add(
      'is-ready',
    );
}

$('#environment-form')
  .addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();
      const button =
        event.submitter;
      setBusy(
        button,
        true,
      );

      try {
        serverState =
          await api(
            'environment',
            {
              method: 'POST',
              body:
                JSON.stringify(
                  formObject(
                    event.currentTarget,
                  ),
                ),
            },
          );
        toast(
          'Публичный адрес сохранён',
        );
        nextStep();
      } catch (error) {
        toast(
          error.message,
          true,
        );
      } finally {
        setBusy(
          button,
          false,
        );
      }
    },
  );

$('#postgres-form')
  .addEventListener(
    'input',
    () => {
      postgresVerified =
        false;
      postgresInput =
        null;
      $('#postgres-next')
        .disabled =
        true;
      $('#postgres-result')
        .hidden =
        true;
    },
  );

$('#test-postgres')
  .addEventListener(
    'click',
    async (event) => {
      const button =
        event.currentTarget;
      const form =
        $('#postgres-form');
      postgresInput =
        formObject(form);
      setBusy(
        button,
        true,
        'Проверяем…',
      );
      postgresVerified =
        false;
      $('#postgres-next')
        .disabled =
        true;

      try {
        const result =
          await api(
            'database/test',
            {
              method: 'POST',
              body:
                JSON.stringify(
                  postgresInput,
                ),
            },
          );
        postgresVerified =
          true;
        $('#postgres-next')
          .disabled =
          false;
        resultBox(
          '#postgres-result',
          'Подключение успешно. PostgreSQL ' +
            result.serverVersion +
            ', database ' +
            result.database +
            ', PostGIS доступен: ' +
            (
              result.postgisAvailable
                ? 'да'
                : 'нет'
            ) +
            '.',
        );
      } catch (error) {
        resultBox(
          '#postgres-result',
          error.message,
          true,
        );
      } finally {
        setBusy(
          button,
          false,
        );
      }
    },
  );

$('#postgres-next')
  .addEventListener(
    'click',
    () => {
      if (
        postgresVerified
      ) {
        nextStep();
      }
    },
  );

for (
  const button of
  document.querySelectorAll(
    '[data-generate]',
  )
) {
  button.addEventListener(
    'click',
    () => {
      const input =
        document.querySelector(
          '[name="' +
            button.dataset
              .generate +
            '"]',
        );
      input.value =
        randomPassword();
      input.type =
        'text';
      input.focus();
      input.select();
    },
  );
}

$('#database-form')
  .addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();

      if (
        !postgresVerified ||
        !postgresInput
      ) {
        toast(
          'Сначала заново проверьте подключение postgres',
          true,
        );
        setStep(
          'postgres',
        );
        return;
      }

      const button =
        event.submitter;
      setBusy(
        button,
        true,
        'Создаём БД и migrations…',
      );

      try {
        await api(
          'database/configure',
          {
            method: 'POST',
            body:
              JSON.stringify({
                admin:
                  postgresInput,
                target:
                  formObject(
                    event.currentTarget,
                  ),
              }),
          },
        );
        const result =
          await api(
            'database/provision',
            {
              method: 'POST',
              body: '{}',
            },
          );
        serverState =
          result.state;
        resultBox(
          '#database-result',
          'Готово. PostGIS ' +
            (
              result.result
                .postgis ??
              '—'
            ) +
            '; migration version ' +
            (
              result.result
                .migrationVersion ??
              '—'
            ) +
            '.',
        );
        toast(
          'База приложения подготовлена',
        );
        setTimeout(
          nextStep,
          500,
        );
      } catch (error) {
        resultBox(
          '#database-result',
          error.message,
          true,
        );
      } finally {
        setBusy(
          button,
          false,
        );
      }
    },
  );

$('#administrator-form')
  .addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();
      const values =
        formObject(
          event.currentTarget,
        );

      if (
        values.password !==
        values.passwordConfirm
      ) {
        toast(
          'Пароли не совпадают',
          true,
        );
        return;
      }

      const button =
        event.submitter;
      setBusy(
        button,
        true,
      );

      try {
        serverState =
          await api(
            'administrator',
            {
              method: 'POST',
              body:
                JSON.stringify({
                  username:
                    values.username,
                  password:
                    values.password,
                }),
            },
          );
        event.currentTarget
          .reset();
        toast(
          'Администратор создан',
        );
        nextStep();
      } catch (error) {
        toast(
          error.message,
          true,
        );
      } finally {
        setBusy(
          button,
          false,
        );
      }
    },
  );

$('#project-form')
  .addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();
      const button =
        event.submitter;
      setBusy(
        button,
        true,
      );

      try {
        serverState =
          await api(
            'project',
            {
              method: 'POST',
              body:
                JSON.stringify(
                  formObject(
                    event.currentTarget,
                  ),
                ),
            },
          );
        toast(
          'Настройки проекта сохранены',
        );
        nextStep();
      } catch (error) {
        toast(
          error.message,
          true,
        );
      } finally {
        setBusy(
          button,
          false,
        );
      }
    },
  );

$('#runtime-form')
  .addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();
      const button =
        event.submitter;
      setBusy(
        button,
        true,
      );

      try {
        runtimeResult =
          await api(
            'runtime',
            {
              method: 'POST',
              body:
                JSON.stringify(
                  formObject(
                    event.currentTarget,
                  ),
                ),
            },
          );
        serverState =
          runtimeResult.state;

        resultBox(
          '#runtime-result',
          runtimeResult
            .directoryReady
            ? 'Каталог журналов доступен для записи.'
            : 'Каталог журналов пока не подготовлен. После мастера выполните: ' +
              runtimeResult
                .directoryCommand,
          !runtimeResult
            .directoryReady,
        );
        toast(
          'Системные параметры подготовлены',
        );
        setTimeout(
          nextStep,
          450,
        );
      } catch (error) {
        toast(
          error.message,
          true,
        );
      } finally {
        setBusy(
          button,
          false,
        );
      }
    },
  );

$('#finish-install')
  .addEventListener(
    'click',
    async (event) => {
      const button =
        event.currentTarget;
      setBusy(
        button,
        true,
        'Записываем .env…',
      );

      try {
        const result =
          await api(
            'finish',
            {
              method: 'POST',
              body: '{}',
            },
          );

        button.hidden =
          true;
        $('#completion')
          .hidden =
          false;
        $('#completion-command')
          .textContent =
          result.nextCommand;

        const extra =
          $('#completion-extra');
        extra.textContent =
          result.logDirectoryReady
            ? 'Каталог логов: ' +
              result.logDirectory
            : 'Перед запуском подготовьте каталог логов: ' +
              result.logDirectoryCommand;

        toast(
          'Установка завершена',
        );
      } catch (error) {
        toast(
          error.message,
          true,
        );
        setBusy(
          button,
          false,
        );
      }
    },
  );

refreshState()
  .catch(
    (error) => {
      $('#global-status')
        .textContent =
        'Ошибка';
      toast(
        error.message,
        true,
      );
    },
  );
