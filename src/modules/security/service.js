import {
  createSecurityAccountService,
} from './account-service.js';
import {
  createSecurityAdministrationService,
} from './admin-service.js';
import {
  createSecurityAuditService,
} from './audit-service.js';
import {
  createSecurityAuthService,
} from './auth-service.js';
import {
  createSecurityMfaService,
} from './mfa-service.js';

/**
 * Domain aggregate for admin security use cases.
 *
 * The aggregate keeps one public service boundary while authentication,
 * account management, MFA, security administration and audit remain focused
 * services. Duplicate public method names are rejected instead of silently
 * overriding one slice with another.
 */
function mergeSecuritySlices(...slices) {
  const aggregate = {};

  for (const slice of slices) {
    for (const [name, value] of Object.entries(slice)) {
      if (Object.hasOwn(aggregate, name)) {
        throw new TypeError(
          `Admin security service method collision: ${name}`,
        );
      }
      aggregate[name] = value;
    }
  }

  return aggregate;
}
export function createAdminSecurityService(
  repository,
  options = {},
) {
  const audit =
    createSecurityAuditService(repository);

  const authentication =
    createSecurityAuthService(
      repository,
      {
        appendAudit:
          audit.appendAudit,
        mfaEncryptionKey:
          options
            .mfaEncryptionKey ??
          null,
      },
    );

  const mfa =
    createSecurityMfaService(
      repository,
      {
        appendAudit:
          audit.appendAudit,
        mfaEncryptionKey:
          options
            .mfaEncryptionKey ??
          null,
      },
    );

  const accounts =
    createSecurityAccountService(
      repository,
      {
        appendAudit: audit.appendAudit,
      },
    );

  const administration =
    createSecurityAdministrationService(
      repository,
      {
        mfaAvailable:
          Boolean(
            options
              .mfaEncryptionKey,
          ),
      },
    );

  return mergeSecuritySlices(
    authentication,
    mfa,
    accounts,
    administration,
    audit,
  );
}
