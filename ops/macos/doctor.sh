#!/bin/sh
set -u
[ "$(uname -s)" = Darwin ] || { echo 'Run on your Mac.'; exit 1; }
echo '--- Managed tunnel ---'
launchctl print "gui/$(id -u)/net.palcare.private-tunnel" 2>/dev/null | grep -E 'state =|pid =|last exit code =|path =' || true
echo '--- Port 3002 listener ---'
/usr/sbin/lsof -nP -iTCP:3002 -sTCP:LISTEN || true
echo '--- GreatBison website through the tunnel ---'
/usr/bin/curl --fail --silent --show-error --connect-timeout 5 --max-time 10 http://127.0.0.1:3002/api/ready
result=$?
echo
echo 'SSH diagnostics: ~/Library/Logs/PalCareTunnel/stderr.log (may include private host metadata).'
echo 'No listener: check launchd/SSH/Tailscale. Listener + forwarding refused: check GreatBison service.'
exit "$result"
