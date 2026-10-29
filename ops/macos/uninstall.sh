#!/bin/sh
set -eu
[ "$(uname -s)" = Darwin ] || { echo 'Run on your Mac.'; exit 1; }
label=net.palcare.private-tunnel
plist="$HOME/Library/LaunchAgents/$label.plist"
base="$HOME/Library/Application Support/PalCareTunnel"
[ ! -L "$plist" ] && [ ! -L "$base" ] || { echo 'Refusing symbolic links.'; exit 1; }
[ -f "$plist" ] || { echo 'No managed plist installed.'; exit 0; }
[ "$(/usr/bin/plutil -extract Label raw "$plist")" = "$label" ] &&
[ "$(/usr/bin/plutil -extract ProgramArguments.1 raw "$plist")" = "$base/tunnel.sh" ] || {
  echo 'Refusing to modify an unrecognized job.'; exit 1;
}
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
mkdir -p "$base"
mv "$plist" "$base/uninstalled-$(date +%Y%m%dT%H%M%S)-$$.plist"
echo 'Tunnel uninstalled. Previous files/logs are preserved; no keys or host trust were changed.'
