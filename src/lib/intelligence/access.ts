import { privateHttpsPresentation } from "../private-preview-origin";

export function studioEvaluationAllowed(
  env: Record<string, string | undefined>,
  requestHost: string,
) {
  if (
    privateHttpsPresentation(env) &&
    env.AG_STUDIO_PRIVATE_DEVELOPMENT_ENABLED === "true"
  )
    return requestHost === new URL(env.APP_ORIGIN!).host;
  if (
    env.AG_STUDIO_LOCAL_EVALUATION_ENABLED !== "true" ||
    !env.APP_ORIGIN ||
    !URL.canParse(env.APP_ORIGIN)
  )
    return false;
  const origin = new URL(env.APP_ORIGIN);
  return (
    ["http:", "https:"].includes(origin.protocol) &&
    ["localhost", "127.0.0.1"].includes(origin.hostname) &&
    origin.origin === env.APP_ORIGIN &&
    requestHost === origin.host
  );
}
