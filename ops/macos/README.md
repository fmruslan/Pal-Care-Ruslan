# Retired tunnel setup — cleanup only

Normal browsing uses **https://greatbison.tail9e8802.ts.net:8444/dashboard**. No Mac tunnel or installer is needed.

Installer/forwarder/doctor sources were retired to `docs/archive/mac-tunnel/` as historical text, not deleted. Do not run archived installation files or the old ZIP. `uninstall.sh` remains solely as a recovery tool: it validates the exact original label/script path, unloads only that LaunchAgent and archives its plist without deleting keys/logs. It does not change Tailscale Serve or kill manual forwards.

First follow [the conditional Mac cleanup procedure](../../docs/MAC-CLEANUP.md). **If the installer was never executed, no LaunchAgent uninstall is necessary.** No Mac-side cleanup has been performed or verified remotely.
