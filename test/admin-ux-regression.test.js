import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFile(path.join(root, relativePath), 'utf8');

test('admin data and project settings are split into meaningful visual groups', async () => {
  const [html, project, layoutSchema, adminCss, reportCss] = await Promise.all([
    read('admin/index.html'),
    read('admin/project-settings-editor.js'),
    read('admin/admin-layout-schema.js'),
    read('admin/admin.css'),
    read('admin/report-config.css'),
  ]);

  assert.match(html, /<legend>Что загружать<\/legend>/);
  assert.match(html, /<legend>Как и откуда загружать<\/legend>/);
  assert.match(html, /class="export-link"[^>]*>↓ Экспорт GeoJSON<\/a>/);
  assert.match(html, /class="export-link"[^>]*>↓ Экспорт ZIP<\/a>/);
  assert.match(adminCss, /\.osm-config-group/);
  assert.match(adminCss, /\.export-link/);

  assert.doesNotMatch(
    project,
    /data-project-settings-tab="/u,
  );
  assert.match(
    layoutSchema,
    /id:\s*'project'[\s\S]*tabs:[\s\S]*id:\s*'general'[\s\S]*id:\s*'metadata'[\s\S]*id:\s*'footer'/u,
  );
  assert.match(
    project,
    /setupAdminTabGroup\([\s\S]*readState:[\s\S]*readTabState[\s\S]*writeState:[\s\S]*writeTabState/u,
  );
  assert.match(
    layoutSchema,
    /id:\s*'project'[\s\S]*tabs:[\s\S]*stateKey:[\s\S]*'project-settings'/u,
  );
  assert.match(
    layoutSchema,
    /id:\s*'project'[\s\S]*hostId:[\s\S]*'project-settings-editor-host'/u,
  );
  for (
    const hostId of [
      'map-city-category-host',
      'map-display-host',
      'map-history-host',
      'map-city-marker-host',
      'map-actions-host',
    ]
  ) {
    assert.match(
      layoutSchema,
      new RegExp(
        `id:\\s*['"]map['"][\\s\\S]*hostId:[\\s\\S]*['"]${hostId}['"]`,
        'u',
      ),
    );
  }
  assert.doesNotMatch(
    layoutSchema,
    /map-settings-editor-host/u,
  );
  assert.doesNotMatch(
    project,
    /mapTab\.dataset\.interfaceTab|mapPanel\.dataset\.interfacePanel/u,
  );
  assert.match(project, /Сохранить настройки карты/u);
  assert.match(project, /trackDirtyForm\([\s\S]*Настройки проекта \/ карты/u);

  assert.match(reportCss, /\.report-interface-panel[\s\S]*padding:\s*0/);
  assert.match(reportCss, /\.report-interface-panel[\s\S]*border:\s*0/);
  assert.match(reportCss, /\.report-interface-panel[\s\S]*background:\s*transparent/);
});

test('user and profile UX expose avatars password policy and non-blocking session controls', async () => {
  const [security, securityCss, layoutCss, profile, profileCss, securityData] = await Promise.all([
    read('admin/security-editor-v2.js'),
    read('admin/security-v2.css'),
    read('admin/admin-layout.css'),
    read('admin/profile-editor.js'),
    read('admin/profile.css'),
    read('src/modules/security/policy.js'),
  ]);

  assert.match(security, /function userListRow\(user\)/);
  assert.match(security, /class="security-user-avatar"/);
  assert.match(security, /if \(user\.hasAvatar\)/);
  assert.match(securityCss, /\.security-user-avatar/);
  assert.match(
    securityCss,
    /#security-panels[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/u,
  );
  assert.doesNotMatch(
    securityCss,
    /\.security-settings-grid/u,
  );
  assert.match(
    securityCss,
    /\.security-ip-block-form[\s\S]*grid-template-columns:[\s\S]*15rem[\s\S]*9rem[\s\S]*auto/u,
  );
  assert.match(
    securityCss,
    /@container admin-layout-block \(max-width: 64rem\)[\s\S]*\.security-settings-form fieldset/u,
  );
  assert.match(
    securityCss,
    /@container admin-layout-block \(max-width: 78rem\)[\s\S]*\.security-password-policy-row/u,
  );
  assert.match(
    layoutCss,
    /@container admin-layout-block \(max-width: 40rem\)[\s\S]*\.admin-heading--responsive/u,
  );
  assert.match(
    securityCss,
    /\.security-audit-block > \.admin-layout-block-host[\s\S]*grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto auto/u,
  );
  assert.match(
    securityCss,
    /@container admin-layout-block \(max-width: 74rem\)[\s\S]*\.security-audit-filter/u,
  );
  assert.match(
    securityCss,
    /@container admin-layout-block \(max-width: 40rem\)[\s\S]*\.security-audit-filter/u,
  );
  assert.match(
    security,
    /security-section-heading admin-heading admin-heading--responsive/u,
  );
  assert.doesNotMatch(
    securityCss,
    /@media \(max-width:\s*1180px\)[\s\S]*\.security-audit-filter/u,
  );
  assert.doesNotMatch(
    securityCss,
    /@media \(max-width:\s*1250px\)[\s\S]*\.security-password-policy-row/u,
  );
  assert.match(
    securityCss,
    /@container admin-layout-block \(max-width: 62rem\)[\s\S]*\.security-master-detail[\s\S]*\.security-users-master[\s\S]*\.security-user-detail/u,
  );
  assert.match(
    securityCss,
    /@container admin-layout-block \(max-width: 40rem\)[\s\S]*\.security-detail-fields[\s\S]*\.security-role-grid[\s\S]*\.security-inline-block-form/u,
  );
  assert.match(
    security,
    /security-user-detail-heading admin-heading admin-heading--responsive/u,
  );
  assert.doesNotMatch(
    securityCss,
    /@media \(max-width:\s*1000px\)[\s\S]*\.security-master-detail/u,
  );

  assert.match(
    securityCss,
    /#security-settings-panels[\s\S]*flex:\s*1 1 auto/u,
  );
  assert.match(
    securityCss,
    /\.security-blocks-layout[\s\S]*grid-template-columns:[\s\S]*\.72fr[\s\S]*1\.28fr/u,
  );
  assert.match(
    securityCss,
    /\.security-block-policy fieldset input\[type="number"\][\s\S]*width:\s*14ch/u,
  );
  assert.match(
    securityCss,
    /@container admin-layout-block \(max-width: 66rem\)[\s\S]*\.security-blocks-layout[\s\S]*grid-template-columns:\s*1fr/u,
  );
  assert.match(
    security,
    /security-ip-block-search[\s\S]*data-ip-block-sort="ip"[\s\S]*data-ip-block-sort="remaining"/u,
  );
  assert.match(
    security,
    /security-ip-allowlist-form[\s\S]*192\.168\.0\.0\/24/u,
  );
  assert.match(
    security,
    /systemIpAllowlist[\s\S]*127\.0\.0\.1\/24[\s\S]*Системный loopback/u,
  );
  assert.match(
    security,
    /security-ip-allowlist-system-badge[\s\S]*Не удаляется/u,
  );
  assert.match(
    securityCss,
    /\.security-ip-allowlist-system-badge/u,
  );
  assert.match(
    securityCss,
    /\.security-ip-allowlist-form[\s\S]*grid-template-columns:[\s\S]*13rem[\s\S]*auto/u,
  );
  assert.match(
    security,
    /left\.append\([\s\S]*allowlist/u,
  );
  assert.match(
    security,
    /security-ip-allowlist-preview/u,
  );
  assert.match(
    security,
    /function parseIpNetwork\([\s\S]*function ipMatchesNetwork\([\s\S]*activeIpBlocks\.filter/u,
  );
  assert.match(
    security,
    /Диапазон:[\s\S]*активных ручных блокировок будет снято/u,
  );
  assert.match(
    security,
    /function validIpv4Address\([\s\S]*function validIpv6Address\([\s\S]*validateIpInput/u,
  );
  assert.match(
    security,
    /security-user-blocked-filter[\s\S]*aria-pressed/u,
  );
  const geometryHtml = await read('admin/index.html');
  const geometryEditor = await read('admin/geometry-editor.js');
  const geometryCss = await read('admin/geometry-editor.css');
  assert.match(
    geometryHtml,
    /geometry-editor-city-search[\s\S]*role="combobox"[\s\S]*geometry-editor-city-options/u,
  );
  assert.match(
    geometryEditor,
    /function renderCityPicker\([\s\S]*includes\([\s\S]*citySelect\.dispatchEvent/u,
  );
  assert.match(
    geometryCss,
    /\.geometry-editor-city-options[\s\S]*overflow-y:\s*auto/u,
  );
  assert.match(
    geometryEditor,
    /rowLeaseIsMine[\s\S]*is-leased[\s\S]*редактируете вы[\s\S]*geometry-editor-row-lease-marker/u,
  );
  assert.match(
    geometryCss,
    /\.geometry-discussion-open[\s\S]*position:\s*absolute[\s\S]*top:\s*0[\s\S]*right:\s*0/u,
  );
  assert.match(
    geometryCss,
    /\.geometry-editor-row\.is-leased:not\(\.is-selected\)[\s\S]*background:/u,
  );
  assert.match(
    security,
    /userCurrentlyBlocked[\s\S]*security-user-row-lock/u,
  );
  assert.doesNotMatch(
    security,
    /Заблокированные пользователи/u,
  );
  assert.match(securityCss, /\.security-audit-filter-panel/);
  assert.match(securityCss, /\.security-audit-filter[\s\S]*grid-template-columns:\s*repeat\(4/);
  assert.match(profile, /profile-avatar-upload-label/);
  assert.match(profile, /id="profile-avatar-delete" disabled/);
  assert.match(profileCss, /\.profile-avatar-actions[\s\S]*grid-template-columns:\s*repeat\(2/);
  assert.match(profileCss, /\.profile-avatar-action/);
  assert.match(
    profileCss,
    /@container admin-layout-block \(max-width: 52rem\)/u,
  );
  assert.doesNotMatch(
    profileCss,
    /@media \(max-width:\s*850px\)/u,
  );
  assert.match(
    profile,
    /\[data-admin-section-panel="profile"\]/u,
  );
  for (
    const hostId of [
      'profile-account-host',
      'profile-password-host',
      'profile-mfa-host',
      'profile-sessions-host',
    ]
  ) {
    assert.match(
      profile,
      new RegExp(
        `#${hostId}`,
        'u',
      ),
    );
  }
  assert.doesNotMatch(
    profile,
    /profile-grid|profile-editor-host/u,
  );
  assert.doesNotMatch(
    profileCss,
    /profile-grid|#profile-editor-host/u,
  );

  assert.match(security, /name="passwordMinLength"/);
  assert.match(security, /name="passwordMaxLength" type="hidden"/);
  assert.doesNotMatch(security, />Максимум символов</);
  assert.match(security, /name="passwordRequireLowercase"/);
  assert.match(security, /name="passwordRequireUppercase"/);
  assert.match(security, /name="passwordRequireDigit"/);
  assert.match(security, /name="passwordRequireSpecial"/);
  assert.match(securityData, /DEFAULT_ADMIN_PASSWORD_POLICY/);
  assert.match(securityData, /passwordRequireSpecial/);

  assert.match(profile, /\/api\/admin\/profile\/password-policy/);
  assert.match(profile, /id="profile-password-policy"/);
  assert.match(profile, /adminConfirm\(/);
  assert.doesNotMatch(profile, /window\.confirm\(/);
  assert.doesNotMatch(profile, /id="profile-confirm-overlay"/);
  assert.match(profile, /class="danger" id="profile-revoke-others"/);
  assert.match(profileCss, /\.profile-session \.danger/);
  assert.doesNotMatch(profileCss, /\.profile-confirm-overlay/);
});


test('desktop admin layout minimizes nested scrolling and exposes compact empty states', async () => {
  const [
    adminCss,
    adminLayoutSchema,
    projectCss,
    project,
    profile,
    profileCss,
    security,
    securityCss,
    messagesCss,
  ] =
    await Promise.all([
      read(
        'admin/admin.css',
      ),
      read(
        'admin/admin-layout-schema.js',
      ),
      read(
        'admin/project-settings.css',
      ),
      read(
        'admin/project-settings-editor.js',
      ),
      read(
        'admin/profile-editor.js',
      ),
      read(
        'admin/profile.css',
      ),
      read(
        'admin/security-editor-v2.js',
      ),
      read(
        'admin/security-v2.css',
      ),
      read(
        'admin/discussion-inbox.css',
      ),
    ]);

  assert.match(
    adminCss,
    /body\s*\{[\s\S]*height:\s*100dvh[\s\S]*grid-template-rows:[\s\S]*minmax\(0, 1fr\)[\s\S]*overflow:\s*hidden/u,
  );
  assert.match(
    adminCss,
    /\.admin-layout\s*\{[\s\S]*height:\s*100%[\s\S]*min-height:\s*0/u,
  );
  assert.match(
    adminCss,
    /@media \(max-width: 1050px\)[\s\S]*body[\s\S]*overflow:\s*auto/u,
  );
  assert.match(
    adminCss,
    /\.portable-kml-transfer[\s\S]*#line-kml-transfer-form[\s\S]*grid-template-columns:[\s\S]*auto/u,
  );

  assert.match(
    projectCss,
    /\[data-interface-panel="map"\][\s\S]*overflow-y:\s*auto/u,
  );
  assert.match(
    projectCss,
    /admin-layout-grid[\s\S]*grid-auto-rows:\s*max-content/u,
  );
  assert.match(
    projectCss,
    /map-actions[\s\S]*grid-column:\s*1 \/ -1/u,
  );
  assert.doesNotMatch(
    adminCss,
    /\.admin-layout-block-host\s*\{[\s\S]*height:\s*100%/u,
  );
  assert.match(
    project,
    /showPolygonGeometries[\s\S]*showLineLabels[\s\S]*showLinePopups[\s\S]*<\/section>/u,
  );
  assert.match(
    adminLayoutSchema,
    /id:\s*'logging'[\s\S]*project-settings-logging-host/u,
  );
  assert.match(
    project,
    /project-file-logging-title[\s\S]*fileLoggingEnabled[\s\S]*fileLogRotateMaxSizeMb[\s\S]*fileLogRotateInterval[\s\S]*fileLogRetentionDays/u,
  );

  assert.match(
    profile,
    /profile-tabs[\s\S]*Профиль и безопасность[\s\S]*Активные сессии/u,
  );
  assert.match(
    profile,
    /selectProfileTab/u,
  );
  assert.match(
    profileCss,
    /\.profile-tabs[\s\S]*repeat\(2/u,
  );
  assert.match(
    profileCss,
    /#profile-sessions[\s\S]*overflow-y:\s*auto/u,
  );
  assert.match(
    profile,
    /PROFILE_SESSION_PAGE_SIZE = 8/u,
  );
  assert.match(
    profile,
    /profile-sessions-prev[\s\S]*profile-sessions-next/u,
  );
  assert.match(
    profileCss,
    /\.profile-session-pagination/u,
  );

  assert.match(
    security,
    /Блок\. учётку[\s\S]*Блок\. IP/u,
  );
  assert.match(
    security,
    /security-ip-block-pagination/u,
  );
  assert.match(
    security,
    /IP_BLOCK_PAGE_SIZE = 12/u,
  );
  assert.match(
    security,
    /pageItems =[\s\S]*\.slice\(/u,
  );
  assert.match(
    securityCss,
    /\.security-blocks-column-ip[\s\S]*minmax\(0, 1fr\)/u,
  );
  assert.match(
    securityCss,
    /\.security-ip-block-pagination/u,
  );
  assert.match(
    securityCss,
    /#security-panel-audit:not\(\[hidden\]\)[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/u,
  );
  assert.match(
    securityCss,
    /#security-settings-panels[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/u,
  );
  assert.match(
    securityCss,
    /\[data-security-settings-panel="blocks"\]:not\(\[hidden\]\)[\s\S]*display:\s*flex[\s\S]*overflow:\s*hidden[\s\S]*grid-template-rows:[\s\S]*minmax\(0, 1fr\)/u,
  );
  assert.match(
    securityCss,
    /#security-timing-settings[\s\S]*repeat\(3[\s\S]*#security-rate-limit-settings[\s\S]*repeat\(2/u,
  );
  assert.match(
    security,
    /<details class="admin-advanced-settings" hidden>/u,
  );
  assert.match(
    securityCss,
    /\.security-detail-fields[\s\S]*grid-template-columns:[\s\S]*3/u,
  );
  assert.match(
    securityCss,
    /\.security-role-grid[\s\S]*repeat\(3/u,
  );
  assert.match(
    security,
    /validateEmail[\s\S]*typeMismatch[\s\S]*Формат корректен/u,
  );

  assert.match(
    messagesCss,
    /\.profile-discussion-thread > \.empty-state[\s\S]*font-size:\s*1rem[\s\S]*text-align:\s*center/u,
  );
  assert.match(
    messagesCss,
    /\.admin-messages-section \.settings-card[\s\S]*height:\s*100%/u,
  );
  const [
    report,
    reportCss,
    lineTypes,
    pointTypes,
  ] =
    await Promise.all([
      read(
        'admin/report-config-editor.js',
      ),
      read(
        'admin/report-config.css',
      ),
      read(
        'admin/line-types-editor.js',
      ),
      read(
        'admin/point-types-editor.js',
      ),
    ]);
  assert.match(
    report,
    /report-formatting-box admin-config-block[\s\S]*report-formatting-summary admin-config-summary/u,
  );
  assert.match(
    report,
    /Условное форматирование[\s\S]*нет настроек[\s\S]*правил/u,
  );
  assert.match(
    reportCss,
    /\.report-formatting-summary[\s\S]*\.report-formatting-status\.is-active/u,
  );
  assert.match(
    lineTypes,
    /line-type-row admin-config-block[\s\S]*line-type-summary admin-config-summary/u,
  );
  assert.match(
    pointTypes,
    /point-type-row-details admin-config-block[\s\S]*point-type-summary admin-config-summary/u,
  );
});


test('admin tabs use one shared primitive while preserving the three visual levels', async () => {
  const [
    html,
    layout,
    layoutCss,
    schema,
    projectCss,
    reportCss,
    securityCss,
  ] = await Promise.all([
    read('admin/index.html'),
    read('admin/admin-layout.js'),
    read('admin/admin-layout.css'),
    read('admin/admin-layout-schema.js'),
    read('admin/project-settings.css'),
    read('admin/report-config.css'),
    read('admin/security-v2.css'),
  ]);

  assert.match(
    html,
    /admin-primary-tabs admin-tabs admin-tabs--primary/u,
  );
  assert.match(
    html,
    /task-tabs admin-tabs admin-tabs--section/u,
  );
  assert.match(
    html,
    /operation-tabs admin-tabs admin-tabs--sub/u,
  );
  assert.match(
    layoutCss,
    /\.admin-tabs--primary[\s\S]*\.admin-tabs--section[\s\S]*\.admin-tabs--sub/u,
  );
  assert.match(
    layout,
    /applyAdminTabPrimitive\([\s\S]*'primary'[\s\S]*applyAdminTabPrimitive\([\s\S]*'section'/u,
  );
  assert.match(
    layout,
    /definition\.visualLevel[\s\S]*'sub'/u,
  );
  assert.match(
    schema,
    /visualLevel:\s*'sub'[\s\S]*stateKey:\s*'project-settings'/u,
  );
  assert.match(
    schema,
    /visualLevel:\s*'sub'[\s\S]*stateKey:\s*'report-view'/u,
  );
  assert.match(
    schema,
    /visualLevel:\s*'section'[\s\S]*stateKey:\s*'security-settings'/u,
  );
  assert.match(
    schema,
    /adminSecurityLayout[\s\S]*visualLevel:\s*'section'[\s\S]*tabsClass:\s*'security-tabs'/u,
  );
  assert.match(
    layout,
    /applyAdminTabPrimitive\([\s\S]*definition\.visualLevel[\s\S]*'sub'/u,
  );

  assert.doesNotMatch(
    projectCss,
    /\.project-settings-tabs button\[aria-selected="true"\]/u,
  );
  assert.doesNotMatch(
    reportCss,
    /\.report-view-tab\[aria-selected="true"\]/u,
  );
  assert.doesNotMatch(
    securityCss,
    /\.security-tabs button\[aria-selected="true"\]/u,
  );
});


test('admin cards and headings use shared visual primitives without domain chrome duplication', async () => {
  const [
    html,
    layout,
    layoutCss,
    adminCss,
    project,
    projectCss,
    security,
    securityCss,
  ] = await Promise.all([
    read('admin/index.html'),
    read('admin/admin-layout.js'),
    read('admin/admin-layout.css'),
    read('admin/admin.css'),
    read('admin/project-settings-editor.js'),
    read('admin/project-settings.css'),
    read('admin/security-editor-v2.js'),
    read('admin/security-v2.css'),
  ]);

  assert.match(
    layoutCss,
    /\.admin-surface[\s\S]*\.admin-heading[\s\S]*\.admin-heading--compact/u,
  );
  assert.match(
    layout,
    /section-heading admin-layout-heading admin-heading/u,
  );
  assert.match(
    html,
    /operation-panel transfer-mode admin-surface admin-surface--mode/u,
  );
  assert.match(
    html,
    /mode-heading admin-heading admin-heading--compact admin-heading--responsive/u,
  );
  assert.match(
    project,
    /project-settings-section admin-surface/u,
  );
  assert.match(
    security,
    /security-metrics-panel admin-surface/u,
  );
  assert.match(
    security,
    /security-mfa-policy-panel admin-surface/u,
  );
  assert.match(
    security,
    /security-ip-panel admin-surface/u,
  );
  assert.match(
    security,
    /security-block-policy admin-surface/u,
  );
  assert.match(
    security,
    /security-section-heading admin-heading admin-heading--responsive/u,
  );
  assert.match(
    security,
    /security-user-detail-heading admin-heading admin-heading--responsive/u,
  );

  assert.doesNotMatch(
    projectCss,
    /\.project-settings-section\s*\{[^}]*border:\s*1px solid var\(--line\)/u,
  );
  assert.doesNotMatch(
    securityCss,
    /\.security-metrics-panel\s*\{[^}]*background:\s*#0d171a/u,
  );
  assert.doesNotMatch(
    securityCss,
    /\.security-mfa-policy-panel\s*\{[^}]*border:\s*1px solid var\(--line\)/u,
  );
  assert.doesNotMatch(
    adminCss,
    /\.mode-heading\s*\{[^}]*display:\s*flex/u,
  );
});


test('admin tables pagination messages and help use shared primitives', async () => {
  const [
    layoutCss,
    project,
    projectCss,
    report,
    reportCss,
    security,
    securityCss,
  ] = await Promise.all([
    read('admin/admin-layout.css'),
    read('admin/project-settings-editor.js'),
    read('admin/project-settings.css'),
    read('admin/report-config-editor.js'),
    read('admin/report-config.css'),
    read('admin/security-editor-v2.js'),
    read('admin/security-v2.css'),
  ]);

  assert.match(
    layoutCss,
    /\.admin-table-wrap[\s\S]*\.admin-pagination[\s\S]*\.admin-message[\s\S]*\.admin-help/u,
  );

  assert.match(
    security,
    /security-audit-table-wrap admin-table-wrap admin-table-wrap--fill/u,
  );
  assert.match(
    security,
    /security-block-table-wrap admin-table-wrap/u,
  );
  assert.match(
    security,
    /security-pagination admin-pagination/u,
  );
  assert.match(
    security,
    /security-ip-block-pagination admin-pagination/u,
  );
  assert.match(
    security,
    /security-message admin-message/u,
  );

  assert.match(
    project,
    /project-settings-message admin-message/u,
  );
  assert.match(
    project,
    /project-settings-help admin-help admin-help--boxed/u,
  );
  assert.match(
    report,
    /report-config-message admin-message/u,
  );
  assert.match(
    report,
    /report-priority-help admin-help/u,
  );
  assert.match(
    report,
    /report-empty admin-help/u,
  );

  assert.doesNotMatch(
    securityCss,
    /\.security-audit-table-wrap\s*\{[^}]*border:\s*1px solid var\(--line\)/u,
  );
  assert.doesNotMatch(
    securityCss,
    /\.security-block-table-wrap\s*\{[^}]*border:\s*1px solid var\(--line\)/u,
  );
  assert.doesNotMatch(
    projectCss,
    /\.project-settings-help\s*\{[^}]*background:\s*#0d171a/u,
  );
  assert.doesNotMatch(
    reportCss,
    /\.report-config-message\s*\{[^}]*(?:^|[;{]\s*)color:\s*var\(--warning\)/mu,
  );
});


test('admin actions and badges use shared primitives while empty state stays canonical', async () => {
  const [
    html,
    layoutCss,
    geometryCss,
    osmCss,
    project,
    projectCss,
    report,
    reportCss,
    security,
    securityCss,
    adminCss,
  ] = await Promise.all([
    read('admin/index.html'),
    read('admin/admin-layout.css'),
    read('admin/geometry-editor.css'),
    read('admin/osm-boundary-editor.css'),
    read('admin/project-settings-editor.js'),
    read('admin/project-settings.css'),
    read('admin/report-config-editor.js'),
    read('admin/report-config.css'),
    read('admin/security-editor-v2.js'),
    read('admin/security-v2.css'),
    read('admin/admin.css'),
  ]);

  assert.match(
    layoutCss,
    /\.admin-actions[\s\S]*\.admin-actions--end[\s\S]*\.admin-actions--stretch[\s\S]*\.admin-badges[\s\S]*\.admin-badge/u,
  );
  assert.match(
    html,
    /geometry-editor-heading-actions admin-actions admin-actions--end/u,
  );
  assert.match(
    html,
    /geometry-merge-mode-actions admin-actions admin-actions--compact/u,
  );
  assert.match(
    html,
    /osm-boundary-toolbar admin-actions admin-actions--end/u,
  );
  assert.match(
    html,
    /osm-boundary-primary-actions admin-actions admin-actions--stretch admin-actions--compact/u,
  );
  assert.match(
    project,
    /project-city-marker-actions admin-actions/u,
  );
  assert.match(
    report,
    /report-row-actions admin-actions admin-actions--compact/u,
  );
  assert.match(
    security,
    /security-access-actions admin-actions/u,
  );
  assert.match(
    security,
    /security-user-badges admin-badges/u,
  );
  assert.match(
    security,
    /admin-badge is-warning/u,
  );
  assert.match(
    security,
    /security-ip-allowlist-system-badge admin-badge/u,
  );

  assert.doesNotMatch(
    geometryCss,
    /\.geometry-editor-heading-actions\s*\{[^}]*display:\s*flex/u,
  );
  assert.doesNotMatch(
    osmCss,
    /\.osm-boundary-toolbar\s*\{[^}]*display:\s*flex/u,
  );
  assert.doesNotMatch(
    projectCss,
    /\.project-city-marker-actions\s*\{[^}]*display:\s*flex/u,
  );
  assert.doesNotMatch(
    reportCss,
    /\.report-row-actions\s*\{[^}]*display:\s*flex/u,
  );
  assert.doesNotMatch(
    securityCss,
    /\.security-user-badges\s*\{[^}]*display:\s*flex/u,
  );

  assert.match(
    adminCss,
    /\.empty-state\s*\{[^}]*color:\s*var\(--muted\)/u,
  );
});


test('geometry OSM and users share master detail shell primitives without sharing domain layout', async () => {
  const [
    html,
    layoutCss,
    geometryCss,
    osmCss,
    security,
    securityCss,
  ] = await Promise.all([
    read('admin/index.html'),
    read('admin/admin-layout.css'),
    read('admin/geometry-editor.css'),
    read('admin/osm-boundary-editor.css'),
    read('admin/security-editor-v2.js'),
    read('admin/security-v2.css'),
  ]);

  assert.match(
    layoutCss,
    /\.admin-master-detail[\s\S]*\.admin-master-detail--framed[\s\S]*\.admin-workspace-pane[\s\S]*\.admin-master-pane[\s\S]*\.admin-detail-pane/u,
  );

  assert.match(
    html,
    /geometry-editor-layout admin-master-detail/u,
  );
  assert.match(
    html,
    /geometry-editor-list-panel admin-workspace-pane admin-master-pane/u,
  );
  assert.match(
    html,
    /geometry-editor-map-panel admin-workspace-pane/u,
  );
  assert.match(
    html,
    /geometry-editor-details admin-workspace-pane admin-detail-pane/u,
  );

  assert.match(
    html,
    /osm-boundary-layout admin-master-detail/u,
  );
  assert.match(
    html,
    /osm-boundary-tree-panel admin-workspace-pane admin-master-pane/u,
  );
  assert.match(
    html,
    /osm-boundary-map-panel admin-workspace-pane/u,
  );
  assert.match(
    html,
    /osm-boundary-details admin-workspace-pane admin-detail-pane/u,
  );

  assert.match(
    security,
    /security-master-detail admin-master-detail admin-master-detail--framed/u,
  );
  assert.match(
    security,
    /security-users-master admin-master-pane/u,
  );
  assert.match(
    security,
    /security-user-detail admin-detail-pane/u,
  );

  assert.doesNotMatch(
    geometryCss,
    /\.geometry-editor-layout\s*\{[^}]*display:\s*grid/u,
  );
  assert.doesNotMatch(
    osmCss,
    /\.osm-boundary-layout\s*\{[^}]*display:\s*grid/u,
  );
  assert.doesNotMatch(
    securityCss,
    /\.security-master-detail\s*\{[^}]*border:\s*1px solid var\(--line\)/u,
  );

  assert.match(
    geometryCss,
    /\.geometry-editor-layout\s*\{[^}]*grid-template-columns:[^}]*19rem[^}]*30rem[^}]*20rem/u,
  );
  assert.match(
    osmCss,
    /\.osm-boundary-layout\s*\{[^}]*grid-template-columns:[^}]*17rem[^}]*28rem[^}]*22rem/u,
  );
  assert.match(
    securityCss,
    /\.security-master-detail\s*\{[^}]*grid-template-columns:\s*minmax\(16rem, 32%\)/u,
  );
});


test('shared UI refactor leaves no empty compatibility selectors or duplicate pane chrome', async () => {
  const [
    adminCss,
    projectCss,
    reportCss,
    securityCss,
    geometryCss,
    osmCss,
  ] = await Promise.all([
    read('admin/admin.css'),
    read('admin/project-settings.css'),
    read('admin/report-config.css'),
    read('admin/security-v2.css'),
    read('admin/geometry-editor.css'),
    read('admin/osm-boundary-editor.css'),
  ]);

  for (const css of [
    adminCss,
    projectCss,
    reportCss,
    securityCss,
    geometryCss,
    osmCss,
  ]) {
    assert.doesNotMatch(
      css,
      /\.[a-z0-9_-]+(?:\s*,\s*\.[a-z0-9_-]+)*\s*\{\s*\}/iu,
    );
  }

  assert.doesNotMatch(
    osmCss,
    /\.osm-boundary-map-panel\s*\{[^}]*(?:min-width|min-height):\s*0/u,
  );
  assert.doesNotMatch(
    osmCss,
    /\.osm-boundary-primary-actions button\s*\{[^}]*flex:\s*1 1 0/u,
  );
});
