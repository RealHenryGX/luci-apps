# gravity-luci-apps

```sh
# 自用 LuCI 应用，纯脚本 + 页面，多数仅含 Shellcode ，兼容性佳（
#   luci-app-usque         WARP/usque 面板：状态、启停、探出口、账号
#   luci-app-campus-auth   锐捷 ePortal 认证：登录、注销、在线状态、cron 保活
```

## 依赖

```sh
apk add curl jq

# usque 本体不在仓库里，自行编译或下 release（e.g. aarch64）
curl -sLO https://github.com/DiniboY1123/usque/releases/latest/download/usque_<ver>_linux_arm64.zip
unzip usque_*.zip -d /tmp/u && install -m755 /tmp/u/usque /usr/bin/usque
```

## 安装

```sh
# 打包
make package/luci-app-usque/compile V=s
make package/luci-app-campus-auth/compile V=s

# 或直接拷入设备
./install.sh
```

## luci-app-usque

```sh
# /etc/config/usque
config main 'main'
	option bind '127.0.0.1'        # 监听地址
	option http_port '7902'        # l4-http-proxy，给 tailscaled / DoH
	option socks_full_port '7903'  # 完整 socks，带 UDP；留空则不启动该实例

# WARP 账号
usque register -a -c /etc/usque/config.json

# 后端，页面使用简单的 fs.exec 调用
usque-ctl status | probe | account | start | stop | restart | register

# probe 走 7902 拉 cdn-cgi/trace，输出 warp= / ip= / colo=
# 进程在&端口在听不代表隧道通，所以建议配探活
*/2 * * * * curl -s -m 6 -o /dev/null -x http://127.0.0.1:7902 https://1.1.1.1/ || /etc/init.d/usque restart
```

## luci-app-campus-auth

```sh
# /etc/config/campus_auth   （建议 chmod 600）
config main 'main'
	option username 'YOUR_STUDENT_ID'
	option password 'YOUR_PASSWORD'
	option portal 'http://10.0.0.1/eportal/'   # 未登录时任意 http 站点的跳转地址，留空则登录时自动依赖CaptivePortal跳转
	option service ''                          # 部分学校需要，不知道请留空
	option iface 'wan'                         # 接口不存在时退回默认路由接口
	option probe '223.5.5.5 119.29.29.29 www.baidu.com'   # 判断在线的目标，用 IP 避免依赖 DNS
	option auto '1'

# 仅实现锐捷 ePortal 二代 /ePortal/InterFace.do?method=login
# passwordEncrypt=false，参数取自跳转 URL 的 queryString；换厂商/换代次请您自行适配

# /usr/local/sbin/campus-login.sh
campus-login.sh status    # 读缓存 + 探测，输出 JSON
campus-login.sh login     # 主动登录
campus-login.sh logout    # 注销，需要登录响应里的 userIndex
campus-login.sh auto      # cron 用，未在线才登录

*/2 * * * * /usr/local/sbin/campus-login.sh auto
```

## License

MIT
