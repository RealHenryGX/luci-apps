include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for campus portal (Ruijie ePortal) authentication
LUCI_DESCRIPTION:=Web portal login / logout / online status for the Ruijie ePortal \
 used by many campus networks, with optional cron keepalive.
LUCI_DEPENDS:=+curl +jq
LUCI_PKGARCH:=all

PKG_VERSION:=1.0.0
PKG_RELEASE:=1

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
