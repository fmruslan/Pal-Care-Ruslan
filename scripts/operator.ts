import { z } from "zod";
import { createDatabase } from "../src/db/connection";
import { OperatorService, operatorActions } from "../src/lib/operator/service";
import { databaseUrl } from "./environment";

const { pool } = createDatabase(databaseUrl());
try {
  const service = new OperatorService(pool);
  const [command, scope, actions] = process.argv.slice(2);
  if (command === "revoke" && z.uuid().safeParse(scope).success) {
    await service.revoke(scope);
    console.log("Operator grant revoked.");
  } else if (command === "issue") {
    const parsed = z
      .array(z.enum(operatorActions))
      .safeParse(actions?.split(","));
    if (
      !parsed.success ||
      !(scope === "catalog" || z.uuid().safeParse(scope).success)
    )
      throw new Error();
    const grant = await service.issue({
      actions: parsed.data,
      caseId: scope === "catalog" ? null : scope,
      hours: 1,
    });
    console.log(
      "PRIVATE ONE-TIME OPERATOR CODE. Do not commit, share publicly, put in URLs, or record it in screenshots.",
    );
    console.log(JSON.stringify(grant));
  } else throw new Error();
} catch {
  console.error(
    "Operator command failed. Usage: operator issue catalog|CASE_UUID comma-separated-actions; operator revoke GRANT_UUID. No financial request was made.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
