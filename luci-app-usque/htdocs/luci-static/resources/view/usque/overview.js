'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require ui';
'require poll';

var CTL = '/usr/local/sbin/usque-ctl';

function parse(res) {
	var raw = (res && res.stdout || '').trim();
	try { return JSON.parse(raw); } catch (e) { return null; }
}

return view.extend({
	load: function() {
		return uci.load('usque');
	},

	callCtl: function(args) {
		var self = this;
		return fs.exec(CTL, args).then(function(res) {
			var out = ((res.stdout || '') + '\n' + (res.stderr || '')).trim();
			if (res.code)
				ui.addNotification(null, E('pre', { 'style': 'white-space:pre-wrap;margin:0' },
					out || _('执行失败（code %d）').format(res.code)), 'danger');
			else if (out)
				ui.addNotification(null, E('pre', { 'style': 'white-space:pre-wrap;margin:0' }, out), 'info');
			return self.refresh();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, String(e)), 'danger');
		});
	},

	refresh: function() {
		return fs.exec(CTL, [ 'status' ]).then(function(res) {
			var d = parse(res), tb = document.getElementById('usque-state');
			if (!d || !tb)
				return;

			var rows = [
				[ 'socks（全栈）', d.socks, d.socks_port ],
				[ 'l4-http-proxy', d.http, d.http_port ]
			];
			tb.innerHTML = '';
			rows.forEach(function(r) {
				var up = r[1].up;
				tb.appendChild(E('tr', {}, [
					E('td', {}, r[0]),
					E('td', {}, r[1].pid || '-'),
					E('td', {}, '127.0.0.1:' + (r[2] || '-')),
					E('td', { 'style': 'color:' + (up ? '#2e7d32' : '#c62828') },
						up ? _('运行中') : _('已停止'))
				]));
			});

			var cfg = document.getElementById('usque-cfg');
			if (cfg)
				cfg.textContent = d.config
					? _('已注册，配置文件 /etc/usque/config.json')
					: _('未注册：/etc/usque/config.json 不存在');

			var btn = document.getElementById('usque-register');
			if (btn)
				btn.style.display = d.config ? 'none' : '';
		}).catch(function() {});
	},

	probe: function(ev) {
		var el = document.getElementById('usque-probe');
		if (el)
			el.textContent = _('探测中…（经 SOCKS 访问 cloudflare cdn-cgi/trace）');

		return fs.exec(CTL, [ 'probe' ]).then(function(res) {
			var d = parse(res);
			el = document.getElementById('usque-probe');
			if (!el)
				return;
			if (!d)
				el.textContent = _('探测失败：无有效输出');
			else if (!d.ok)
				el.textContent = _('探测失败：') + (d.error || '');
			else
				el.textContent = 'warp=%s   ip=%s   colo=%s   loc=%s'.format(d.warp, d.ip, d.colo, d.loc);
		});
	},

	account: function(ev) {
		var el = document.getElementById('usque-probe');
		if (el)
			el.textContent = _('查询中…');

		return fs.exec(CTL, [ 'account' ]).then(function(res) {
			var d = parse(res);
			el = document.getElementById('usque-probe');
			if (!el)
				return;
			if (!d || !d.ok)
				el.textContent = _('查询失败：') + ((d && d.error) || _('未注册'));
			else
				el.textContent = _('类型') + '=' + d.type + '   ' + _('创建') + '=' + d.created +
					'   ' + _('设备数') + '=' + d.devices + '   licence=' + (d.license || '-');
		});
	},

	render: function() {
		var self = this, m, s, o;

		m = new form.Map('usque', _('WARP / MASQUE（usque）'),
			_('l4-http-proxy 承载 tailscaled 的 HTTPS_PROXY 与 DoH 通道（mihomo 的 CF-MASQUE 出口也用它）；socks（全栈）供需要 UDP 的场景。改动端口后需重启服务，Tailscale 会短暂重连。'));

		s = m.section(form.NamedSection, 'main', 'main');
		s.anonymous = true;

		o = s.option(form.Value, 'bind', _('监听地址'));
		o.datatype = 'ipaddr';
		o.rmempty = false;

		o = s.option(form.Value, 'socks_full_port', _('SOCKS5 端口（socks 全栈，支持 UDP）'));
		o.datatype = 'port';
		o.placeholder = '7903';

		o = s.option(form.Value, 'http_port', _('HTTP 代理端口（l4-http-proxy）'));
		o.datatype = 'port';
		o.placeholder = '7902';

		o = s.option(form.Value, 'sni', _('SNI 覆盖'));
		o.placeholder = 'client-masque.cloudflareclient.com';
		o.description = _('留空使用默认。QUIC 的 SNI 是明文，换成普通域名可降低特征。');

		return m.render().then(function(node) {
			var panel = E('div', { 'style': 'margin-top:1.5em' }, [
				E('h3', {}, _('运行状态')),
				E('div', { 'id': 'usque-cfg', 'style': 'margin-bottom:8px' }),
				E('table', { 'class': 'table' }, [
					E('thead', {}, E('tr', {}, [
						E('th', {}, _('实例')), E('th', {}, 'PID'),
						E('th', {}, _('监听')), E('th', {}, _('状态'))
					])),
					E('tbody', { 'id': 'usque-state' })
				]),
				E('div', { 'style': 'margin:12px 0' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-apply',
						'click': ui.createHandlerFn(self, function() { return self.callCtl([ 'start' ]); })
					}, _('启动')), ' ',
					E('button', {
						'class': 'btn cbi-button cbi-button-reset',
						'click': ui.createHandlerFn(self, function() { return self.callCtl([ 'stop' ]); })
					}, _('停止')), ' ',
					E('button', {
						'class': 'btn cbi-button',
						'click': ui.createHandlerFn(self, function() { return self.callCtl([ 'restart' ]); })
					}, _('重启')), ' ',
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'id': 'usque-register',
						'click': ui.createHandlerFn(self, function() { return self.callCtl([ 'register' ]); })
					}, _('注册新账号'))
				]),
				E('div', { 'style': 'margin:12px 0' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': ui.createHandlerFn(self, self.probe)
					}, _('探测出口')), ' ',
					E('button', {
						'class': 'btn cbi-button',
						'click': ui.createHandlerFn(self, self.account)
					}, _('账号信息'))
				]),
				E('div', { 'id': 'usque-probe', 'style': 'font-family:monospace;margin-top:8px' })
			]);

			self.refresh();
			poll.add(function() { return self.refresh(); }, 15);

			return E('div', {}, [ panel, node ]);
		});
	},

	handleSaveApply: function(ev, mode) {
		return this.super('handleSaveApply', [ ev, mode ]).then(function() {
			return fs.exec(CTL, [ 'restart' ]);
		});
	}
});
