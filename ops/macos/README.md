# One-time Mac tunnel setup

This installs a per-user LaunchAgent, **not** a public service, VPN, login system or AI authorization. GreatBison must run its separate private preview. Tailscale must start at Mac login and remain signed in on both devices.

1. Save this entire folder on the Mac (or unzip the supplied non-secret bundle).
2. Close your old manually started Pal Care SSH tunnel if one is running. The installer refuses another port-3002 listener; it never kills it.
3. Double-click **Install Pal Care Tunnel.command**. If macOS blocks execution or the executable bit was lost, open Terminal **once**, type `sh `, drag `install.sh` into that window, and press Return.
4. Open **http://127.0.0.1:3002/dashboard**. No OpenCode session or open terminal is needed after setup.

The installer first verifies existing unattended SSH with strict host-key checking. It creates no SSH key, accepts no new host key and changes no Tailscale/SSH security policy. It uses built-in `/usr/bin/ssh`, default identities/agent and known_hosts, with `-F /dev/null` to avoid inheriting other port forwards or proxy configuration. Custom identity/config-only authentication may therefore need owner setup. If verification fails, establish access to `bigrus@greatbison.tail9e8802.ts.net` yourself using an already trusted host identity and existing authentication. Do not blindly accept a changed key. Tailscale SSH **check mode** or expiring device authentication can still demand human reauthentication; this installer does not bypass it. Remote Login on the Mac is not required.

SSH binds only Mac **127.0.0.1:3002**, forwarding only to GreatBison **127.0.0.1:3002**. Keepalives detect dead connections; launchd retries after exit (15-second throttle). It resumes after network restoration/wake while logged in. A Mac LaunchAgent begins at login, not before FileVault unlock/user login, and cannot serve while the Mac sleeps/offline. A server app outage does not necessarily close SSH: restoring the server restores forwarding through the existing tunnel.

## Diagnose / undo

Run `sh doctor.sh` from this folder. It shows the managed job, local listener and GET-only readiness. Logs: `~/Library/Logs/PalCareTunnel/`. Reinstall preserves the previous managed script/plist; unknown jobs and port owners are refused. Run `sh uninstall.sh` to unload only this job and archive its plist; keys, logs and previous files remain.

Verify on the Mac: Chrome opens Home and Insights; close Terminal/OpenCode; log out/in; disconnect/reconnect Tailscale; sleep/wake. Confirm the tunnel returns without a manual SSH command. These require actual Mac testing and are **not proved** by Linux shell syntax checks.
