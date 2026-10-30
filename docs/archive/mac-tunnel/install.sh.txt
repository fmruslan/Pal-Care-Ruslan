#!/bin/sh
set -eu
umask 077
[ "$(uname -s)" = Darwin ] || { echo 'Run this installer on your Mac, not GreatBison.'; exit 1; }
[ "$(id -u)" -ne 0 ] || { echo 'Run as your normal Mac user, without sudo.'; exit 1; }
label=net.palcare.private-tunnel
domain="gui/$(id -u)"
base="$HOME/Library/Application Support/PalCareTunnel"
plist="$HOME/Library/LaunchAgents/$label.plist"
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
for path in "$base" "$base/tunnel.sh" "$plist" "$HOME/Library/LaunchAgents"; do
  [ ! -L "$path" ] || { echo "Refusing symbolic link: $path"; exit 1; }
done
# Refuse all existing port owners unless it is precisely our running launchd PID.
listeners=$(/usr/sbin/lsof -nP -t -iTCP:3002 -sTCP:LISTEN 2>/dev/null || true)
managed=$(launchctl print "$domain/$label" 2>/dev/null | awk '/^[[:space:]]*pid = / {print $3; exit}')
if [ -n "$managed" ] && [ ! -f "$plist" ]; then
  echo 'A job with this label exists without a recognized plist; refusing to replace it.'; exit 1
fi
if [ -n "$listeners" ]; then
  [ -f "$plist" ] && [ -n "$managed" ] && [ "$listeners" = "$managed" ] || {
    echo 'Port 3002 already has a different listener. Nothing was killed or replaced.'
    /usr/sbin/lsof -nP -iTCP:3002 -sTCP:LISTEN || true
    exit 1
  }
fi
echo 'Checking existing unattended SSH access and host trust (no keys or trust will be created)...'
/usr/bin/ssh -F /dev/null -T -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o ConnectTimeout=10 -o ControlMaster=no -o ControlPath=none \
  bigrus@greatbison.tail9e8802.ts.net /usr/bin/true || {
    echo 'Unattended SSH failed. Establish trusted SSH access first; see README.md. No installation was changed.'
    exit 1
  }
mkdir -p "$base" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/PalCareTunnel"
stamp=$(date +%Y%m%dT%H%M%S)-$$
# Only replace a previously managed job after preserving its files.
if [ -f "$plist" ]; then
  [ "$(/usr/bin/plutil -extract Label raw "$plist")" = "$label" ] &&
  [ "$(/usr/bin/plutil -extract ProgramArguments.1 raw "$plist")" = "$base/tunnel.sh" ] || {
    echo 'Existing plist is not this installer’s managed tunnel; refusing replacement.'; exit 1;
  }
  cp -p "$plist" "$base/previous-$stamp.plist"
fi
if [ -f "$base/tunnel.sh" ]; then cp -p "$base/tunnel.sh" "$base/previous-$stamp.sh"; fi
launchctl bootout "$domain/$label" 2>/dev/null || true
cp "$here/tunnel.sh" "$base/tunnel.sh"
chmod 700 "$base/tunnel.sh"
tmp="$base/agent-$stamp.plist"
/usr/bin/plutil -create xml1 "$tmp"
/usr/bin/plutil -insert Label -string "$label" "$tmp"
/usr/bin/plutil -insert ProgramArguments -xml '<array/>' "$tmp"
/usr/bin/plutil -insert ProgramArguments.0 -string /bin/sh "$tmp"
/usr/bin/plutil -insert ProgramArguments.1 -string "$base/tunnel.sh" "$tmp"
/usr/bin/plutil -insert RunAtLoad -bool true "$tmp"
/usr/bin/plutil -insert KeepAlive -bool true "$tmp"
/usr/bin/plutil -insert ThrottleInterval -integer 15 "$tmp"
/usr/bin/plutil -insert StandardOutPath -string "$HOME/Library/Logs/PalCareTunnel/stdout.log" "$tmp"
/usr/bin/plutil -insert StandardErrorPath -string "$HOME/Library/Logs/PalCareTunnel/stderr.log" "$tmp"
/usr/bin/plutil -lint "$tmp"
mv "$tmp" "$plist"
launchctl enable "$domain/$label"
launchctl bootstrap "$domain" "$plist"
echo 'Installed. The tunnel starts at Mac login and reconnects after SSH/network failures.'
echo 'Open http://127.0.0.1:3002/dashboard (Tailscale must be connected).'
/bin/sh "$here/doctor.sh" || true
