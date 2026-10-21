#!/bin/sh
# Ruijie ePortal v2 campus network authentication — backend for LuCI
# subcommands: status | login | logout | auto
#
# All deployment-specific values come from /etc/config/campus_auth (mode 600):
#   username / password / service / iface / portal / probe / auto
# Session cache is written to /etc/campus-state.json (persists across reboots).

CONF=campus_auth
STATE=/etc/campus-state.json
get_opt() { uci -q get "$CONF.main.$1"; }

USER=$(get_opt username)
PASS=$(get_opt password)
SERVICE=$(get_opt service)
IFACE=$(get_opt iface)
PORTAL=$(get_opt portal)
PROBE=$(get_opt probe)
AUTO=$(get_opt auto)

# Targets used to tell "online" from "redirected to the portal".
# Plain HTTP on an IP, so no DNS is required while unauthenticated.
[ -n "$PROBE" ] || PROBE="223.5.5.5 119.29.29.29 www.baidu.com"

# The interface name may change after replug/reboot; fall back to the default-route iface.
if [ -z "$IFACE" ] || [ ! -e "/sys/class/net/$IFACE" ]; then
	IFACE=$(ip route show default 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')
fi
[ -n "$IFACE" ] || IFACE=wan

SRC=$(ip -4 addr show "$IFACE" 2>/dev/null | awk '/inet /{print $2}' | cut -d/ -f1)

json_esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

state_get() { [ -f "$STATE" ] && sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" "$STATE" | head -1; }

# Empty arguments keep the previous value, so partial updates never wipe the cache.
state_save() {
	_uid=${1:-$(state_get userId)}
	_uip=${2:-$(state_get userIp)}
	_umac=${3:-$(state_get userMac)}
	_svc=${4:-$(state_get service)}
	_idx=${5:-$(state_get userIndex)}
	_base=${6:-$(state_get portalBase)}
	printf '{"userId":"%s","userIp":"%s","userMac":"%s","service":"%s","userIndex":"%s","portalBase":"%s"}\n' \
		"$(json_esc "$_uid")" "$(json_esc "$_uip")" "$(json_esc "$_umac")" \
		"$(json_esc "$_svc")" "$(json_esc "$_idx")" "$(json_esc "$_base")" > "$STATE" 2>/dev/null
	chmod 600 "$STATE" 2>/dev/null
	unset _uid _uip _umac _svc _idx _base
}

# Portal base URL, e.g. http://10.0.0.1/eportal/
# Order: explicit config -> value learned at the last login -> nothing.
portal_base() {
	if [ -n "$PORTAL" ]; then printf '%s' "$PORTAL"; return 0; fi
	_pb=$(state_get portalBase)
	if [ -n "$_pb" ]; then printf '%s' "$_pb"; return 0; fi
	return 1
}

# Detect whether authentication is needed: prints a redirect URL (non-empty = not authenticated),
# empty output = already online.
probe_url() {
	# A real HTTP response without redirect means online: return immediately.
	for p in $PROBE; do
		meta=$(curl -s -m 2 --interface "$SRC" -o /tmp/.campus_probe \
			-w "%{http_code} %{redirect_url}" "http://$p/" 2>/dev/null)
		code=${meta%% *}
		redir=${meta#* }
		[ "$redir" = "$meta" ] && redir=
		if [ -n "$redir" ]; then printf '%s' "$redir"; return 0; fi
		u=$(grep -oE "location\.href='[^']+'" /tmp/.campus_probe 2>/dev/null | head -1 | sed "s/.*href='//; s/'\$//")
		if [ -n "$u" ]; then printf '%s' "$u"; return 0; fi
		[ "$code" != "000" ] && return 1
	done
	return 1
}

# Look up the online session by userIndex; prints nothing on failure.
query_info() {
	raw=$(curl -s -m 3 --interface "$SRC" -X POST "${1}InterFace.do?method=getOnlineUserInfo" --data "userIndex=$2" 2>/dev/null)
	[ -n "$raw" ] || return 1
	printf '%s' "$raw"
}

field() { printf '%s' "$1" | sed -n "s/.*\"$2\":\"\([^\"]*\)\".*/\1/p" | head -1; }

online_json() {
	p=$(portal_base)
	idx=$(state_get userIndex)

	raw=""
	[ -n "$p" ] && [ -n "$idx" ] && raw=$(query_info "$p" "$idx")

	uid=$(field "$raw" userId)
	if [ -n "$uid" ]; then
		uip=$(field "$raw" userIp); umac=$(field "$raw" userMac)
		svc=$(field "$raw" realServiceName); nidx=$(field "$raw" userIndex)
		state_save "$uid" "$uip" "$umac" "$svc" "${nidx:-$idx}"
		printf '{"online":true,"source":"portal","userId":"%s","userIp":"%s","userMac":"%s","service":"%s","message":"","userIndex":"%s"}\n' \
			"$(json_esc "$uid")" "$(json_esc "$uip")" "$(json_esc "$umac")" "$(json_esc "$svc")" "$(json_esc "${nidx:-$idx}")"
		return
	fi

	# No account info available: fall back to reachability.
	if probe_url >/dev/null 2>&1; then
		printf '{"online":false,"source":"probe","userId":"","userIp":"","userMac":"","service":"","message":"未认证","userIndex":""}\n'
	else
		printf '{"online":true,"source":"probe","userId":"%s","userIp":"%s","userMac":"%s","service":"%s","message":"","userIndex":"%s"}\n' \
			"$(json_esc "$(state_get userId)")" "$(json_esc "$(state_get userIp)")" \
			"$(json_esc "$(state_get userMac)")" "$(json_esc "$(state_get service)")" \
			"$(json_esc "$(state_get userIndex)")"
	fi
}

do_login() {
	[ -n "$USER" ] && [ -n "$PASS" ] || { echo '{"ok":false,"msg":"账号或密码为空"}'; return 2; }
	url=$(probe_url)
	if [ -z "$url" ]; then echo '{"ok":true,"msg":"已经在线"}'; return 0; fi
	qs=${url#*\?}
	# Prefer the portal that actually redirected us; fall back to the configured base.
	base=$(printf '%s' "$url" | sed -E 's#(https?://[^/]+/[^/]+/).*#\1#')
	[ -n "$base" ] || base=$(portal_base) || {
		echo '{"ok":false,"msg":"无法确定认证服务器地址：请在配置里填写 portal"}'; return 2; }
	resp=$(curl -s -m 12 --interface "$SRC" -X POST "${base}InterFace.do?method=login" \
		--data-urlencode "userId=$USER" \
		--data-urlencode "password=$PASS" \
		--data-urlencode "service=$SERVICE" \
		--data-urlencode "queryString=$qs" \
		--data-urlencode "operatorPwd=" \
		--data-urlencode "operatorUserId=" \
		--data-urlencode "validcode=" \
		--data-urlencode "passwordEncrypt=false" 2>/dev/null)
	res=$(field "$resp" result)
	msg=$(field "$resp" message)
	idx=$(field "$resp" userIndex)
	if [ "$res" = "success" ]; then
		state_save "" "" "" "$SERVICE" "$idx" "$base"
		echo '{"ok":true,"msg":"登录成功"}'
	else
		printf '{"ok":false,"msg":"%s"}\n' "$(json_esc "${msg:-${res:-无响应}}")"
	fi
}

do_logout() {
	idx=$(state_get userIndex)
	[ -n "$idx" ] || { online_json >/dev/null; idx=$(state_get userIndex); }
	[ -n "$idx" ] || { echo '{"ok":false,"msg":"会话索引缺失：锐捷只接受带 userIndex 的注销请求，而索引只在登录响应里返回。当前会话不是本机登录建立的，等下次掉线后自动重登会补齐，之后注销即可用。"}'; return 2; }
	p=$(portal_base) || { echo '{"ok":false,"msg":"无法确定认证服务器地址：请在配置里填写 portal"}'; return 2; }
	resp=$(curl -s -m 10 --interface "$SRC" -X POST "${p}InterFace.do?method=logout" \
		--data-urlencode "userIndex=$idx" 2>/dev/null)
	res=$(field "$resp" result)
	msg=$(field "$resp" message)
	if [ "$res" = "success" ]; then
		rm -f "$STATE"
		echo '{"ok":true,"msg":"已注销"}'
	else
		printf '{"ok":false,"msg":"%s"}\n' "$(json_esc "${msg:-无响应}")"
	fi
}

case "${1:-status}" in
status) online_json ;;
login)  do_login ;;
logout) do_logout ;;
auto)
	[ "$AUTO" = "1" ] || exit 0
	if probe_url >/dev/null 2>&1; then
		r=$(do_login)
		logger -t campus-auth "auto: $r"
		printf '%s\n' "$r"
	fi
	;;
*) echo "usage: $0 status|login|logout|auto" >&2; exit 1 ;;
esac
