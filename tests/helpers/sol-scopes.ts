import { createHmac } from "node:crypto";

const projects = { "desktop-light": 3112, "mobile-dark": 3113 } as const;
export function solTestScope(
  project: string,
  seed = process.env.PALCARE_SOL_TEST_RUN,
) {
  if (
    !Object.hasOwn(projects, project) ||
    !seed ||
    !/^[a-f0-9]{64}$/.test(seed)
  )
    throw new Error("Explicit isolated Sol test project/run required");
  const token = (scope: string) =>
    createHmac("sha256", seed).update(`${project}:${scope}`).digest("hex");
  return {
    origin: `http://127.0.0.1:${projects[project as keyof typeof projects]}`,
    customer: token("customer"),
    studio: token("studio"),
  };
}
