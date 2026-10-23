export function studioEvaluationAllowed(
  env: Record<string, string | undefined>,
  requestHost: string,
) {
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
