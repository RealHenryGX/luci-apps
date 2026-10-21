include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for usque (Cloudflare WARP / MASQUE)
LUCI_DESCRIPTION:=Status, start/stop, exit probe and account info for the usque \
 MASQUE client. Requires the usque binary to be installed separately.
LUCI_DEPENDS:=+curl +jq
LUCI_PKGARCH:=all

PKG_VERSION:=1.0.0
PKG_RELEASE:=1

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
