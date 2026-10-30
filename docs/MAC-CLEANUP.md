# Optional Mac cleanup — Tailscale bookmark replaces the tunnel

**Use https://greatbison.tail9e8802.ts.net:8444/dashboard.** No tunnel, installer or open Terminal is needed for browsing. The agent has no Mac access and has **not** inspected or removed anything on your Mac. Your confirmed Mac Chrome check covers Home only, not the other routes.

Do nothing to components that are absent or unrelated. These steps run **on the Mac**, never GreatBison. Do not use `tailscale serve reset`, disable Tailscale, kill all SSH processes, change SSH keys/configuration, or touch OpenCode port 8443.

## 1. Possible accidental Mac Serve endpoint

Run `tailscale serve status --json`. This must show the **Mac's own hostname**, not GreatBison's. If its **8444** handler is exactly the accidentally created Pal Care proxy to **http://127.0.0.1:3002**, and you confirm it has no other purpose, remove only that Mac endpoint:

```sh
tailscale serve --https=8444 off
```

If it is absent, different, or ownership/purpose is uncertain, leave it alone. This command must not be run on GreatBison: GreatBison's 8444 endpoint is the working bookmark.

## 2. Possible manual SSH tunnel

```sh
lsof -nP -iTCP:3002 -sTCP:LISTEN
```

If no listener appears, skip. Otherwise inspect only the listed PID with `ps -p PID -o pid=,command=`. Stop it with `kill -TERM PID` **only if** it is the obsolete SSH forward to `bigrus@greatbison.tail9e8802.ts.net`, forwarding `127.0.0.1:3002` to `127.0.0.1:3002`, and it has no other forwards/work. Closing its original terminal with Ctrl-C is simpler if still open. Do not kill an unrelated SSH session or process. If launchd owns it, use step 3 instead so it does not restart.

## 3. Possible LaunchAgent

**If the installer was never executed, no LaunchAgent uninstall is necessary.** Downloading/unzipping the bundle alone installs nothing.

To identify a possible installation:

```sh
launchctl print "gui/$(id -u)/net.palcare.private-tunnel"
plutil -p "$HOME/Library/LaunchAgents/net.palcare.private-tunnel.plist"
```

Missing job/file means there is nothing to uninstall. If present, confirm **Label = net.palcare.private-tunnel** and **ProgramArguments = /bin/sh, $HOME/Library/Application Support/PalCareTunnel/tunnel.sh** (with your actual home path). Only then unload that exact job and move its plist out of LaunchAgents, retaining the script/logs for recovery:

```sh
launchctl bootout "gui/$(id -u)/net.palcare.private-tunnel"
mv -n "$HOME/Library/LaunchAgents/net.palcare.private-tunnel.plist" \
  "$HOME/Library/Application Support/PalCareTunnel/retired-owner-reviewed.plist"
```

If the job is already unloaded, skip `bootout` and archive only the confirmed plist. If the label/arguments differ or the destination exists, stop and review; never overwrite another file. The original bundle's `uninstall.sh` (also retained in the repository at `ops/macos/uninstall.sh`) performs these same narrow validation/archive steps without installing anything. No other launchd job should be modified.

## 4. Possible downloaded ZIP/folder

In Finder, search Downloads for **Pal-Care-Mac-Tunnel-20261029.zip** and **Pal Care Mac Tunnel**. If confirmed unused, move only those exact items to Trash, or keep them in a clearly marked retired folder. Do not run the installer. Do not delete unrelated downloads, `~/.ssh`, Tailscale configuration or log/recovery directories.

After any applicable cleanup, open the GreatBison bookmark. There is no need to reinstall anything or restart OpenCode. Mac login/sleep/network checks remain owner-side observations; they are not claimed by Linux browser emulation.
