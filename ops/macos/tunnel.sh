#!/bin/sh
# Foreground process supervised by launchd; never opens a public listener.
set -eu
exec /usr/bin/ssh -F /dev/null -N -T \
  -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o ExitOnForwardFailure=yes -o ConnectTimeout=10 \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -o ControlMaster=no -o ControlPath=none \
  -L 127.0.0.1:3002:127.0.0.1:3002 \
  bigrus@greatbison.tail9e8802.ts.net
