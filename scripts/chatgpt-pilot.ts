import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { PilotFiles, PilotError } from "./chatgpt-pilot/files";
import { signIn, importRegistration, signOut } from "./chatgpt-pilot/auth";
import { preparePilot, runPilot, safeFailure } from "./chatgpt-pilot/inference";

// Deliberately no dotenv, application environment, OpenCode/Codex paths or DB imports.
const files = new PilotFiles(
  join(homedir(), ".config", "palcare-chatgpt-pilot"),
);
const [command, ...flags] = process.argv.slice(2);
try {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) throw new PilotError("pilot_requires_node_22_or_newer");
  await files.locked(async () => {
    switch (command) {
      case "prepare":
        if (flags.length) throw new PilotError("pilot_unexpected_arguments");
        await preparePilot(files);
        console.log(
          "CareOS pilot prepared. No sign-in, transfer or inference performed.",
        );
        break;
      case "sign-in":
        if (flags.length || process.platform !== "darwin")
          throw new PilotError("pilot_run_signin_on_your_mac");
        await signIn(files, (url) => {
          const child = spawn("/usr/bin/open", [url], { stdio: "ignore" });
          child.on("error", () =>
            console.error(
              "Browser could not be opened. Stop and request help.",
            ),
          );
          console.log(
            "Continue with ChatGPT in your Mac browser. Authorize Pal Care — CareOS. No inference will run.",
          );
        });
        console.log(
          "Connected. STOP here: no credential transfer or inference performed.",
        );
        console.log(
          "Open https://chatgpt.com/settings/usage and set CareOS's app limit; disable its additional paid-credit usage. Do not paste tokens or callback URLs into chat. Return to OpenCode to confirm and approve the pilot.",
        );
        break;
      case "import":
        if (flags.length || process.platform !== "linux")
          throw new PilotError("pilot_import_only_on_private_vm");
        await importRegistration(files);
        console.log(
          "CareOS's own authorization imported; VM host ID preserved. VM now owns refreshes. No inference performed.",
        );
        break;
      case "status": {
        if (flags.length) throw new PilotError("pilot_unexpected_arguments");
        const registration = await files.registration();
        const journal = (await files.read("pilot.json")) as {
          status?: string;
          attempts?: unknown[];
        } | null;
        console.log(
          JSON.stringify(
            {
              connected: !!registration?.tokens,
              planPermission:
                registration?.tokens?.scopes.includes(
                  "chatgpt.tokens.use.direct",
                ) ?? false,
              pilot: journal?.status ?? "not_prepared",
              inferenceAttempts: journal?.attempts?.length ?? 0,
              creditSetting:
                "owner confirmation in ChatGPT required; not machine-verifiable",
              webRuntimeEnabled: false,
            },
            null,
            2,
          ),
        );
        break;
      }
      case "run":
        if (
          process.platform !== "linux" ||
          flags.length !== 2 ||
          !flags.includes("--approve-pilot") ||
          !flags.includes("--credits-disabled")
        )
          throw new PilotError(
            "pilot_approval_and_no_credit_confirmation_required",
          );
        console.log(
          JSON.stringify(
            await runPilot(files, { approved: true, creditsDisabled: true }),
            null,
            2,
          ),
        );
        break;
      case "disconnect": {
        if (flags.length) throw new PilotError("pilot_unexpected_arguments");
        const revoked = await signOut(files);
        console.log(
          revoked
            ? "CareOS renewable session revoked; local tokens cleared. Registration/host/pilot evidence retained."
            : "Local tokens cleared; remote revocation NOT confirmed. Disconnect CareOS in ChatGPT Settings > Security and login > Sign in with ChatGPT.",
        );
        if (!revoked) process.exitCode = 2;
        break;
      }
      default:
        throw new PilotError(
          "pilot_commands_prepare_sign-in_import_status_run_disconnect",
        );
    }
  });
} catch (error) {
  console.error(
    `STOP: ${safeFailure(error)}. No automatic retry or paid API fallback. Do not delete pilot evidence or rotate credentials to retry.`,
  );
  process.exitCode = 2;
}
