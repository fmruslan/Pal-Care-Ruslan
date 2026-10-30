export const privateHttpsOrigin = "https://greatbison.tail9e8802.ts.net:8444";

/** Explicit presentation configuration, never identity, scope or model authority.
 * Neither Host nor X-Forwarded-* can turn this on. No wildcard tailnet trust.
 */
export function privateHttpsPresentation(
  env: Record<string, string | undefined>,
) {
  return (
    env.PALCARE_PERSISTENT_PREVIEW === "true" &&
    env.PALCARE_PRIVATE_HTTPS_PREVIEW === "true" &&
    env.APP_ORIGIN === privateHttpsOrigin
  );
}
