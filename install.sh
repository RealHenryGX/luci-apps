#!/bin/sh
# Install the apps on the device directly (without building an ipk/apk).
# Usage: run ./install.sh from the repository root.
set -e

[ -d /etc/config ] || { echo "this does not look like an OpenWrt device"; exit 1; }

for app in luci-app-usque luci-app-campus-auth; do
	[ -d "$app" ] || { echo "missing $app — run this from the repository root"; exit 1; }
	echo "== installing $app =="
	cp -r "$app/root/." /
	cp -r "$app/htdocs/." /www/
done

chmod 755 /usr/local/sbin/usque-ctl
chmod 755 /usr/local/sbin/campus-login.sh
chmod 755 /etc/init.d/usque
chmod 600 /etc/config/campus_auth

/etc/init.d/rpcd restart
echo "done. reload LuCI — 'WARP (usque)' and the campus auth page appear under Services."
echo "note: the usque binary and /etc/usque/config.json must be prepared separately."
