'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require ui';
'require poll';

var SCRIPT = '/usr/local/sbin/campus-login.sh';

return view.extend({
	load: function() {
		return uci.load('campus_auth');
	},

	call: function(cmd) {
		var self = this;
		return fs.exec(SCRIPT, [ cmd ]).then(function(res) {
			var out = (res.stdout || '').trim() || (res.stderr || '').trim();
			if (out)
				ui.addNotification(null, E('pre', { 'style': 'white-space:pre-wrap;margin:0' }, out), 'info');
			return self.refresh();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, String(e)), 'danger');
		});
	},

	refresh: function() {
		var el = document.getElementById('campus-auth-status');
		if (!el)
			return Promise.resolve();

		return fs.exec(SCRIPT, [ 'status' ]).then(function(res) {
			var raw = (res.stdout || '').trim(), d = null;
			try { d = JSON.parse(raw); } catch (e) { d = null; }

			if (!d) {
				el.textContent = raw || _('无响应');
				return;
			}

			var online = d.online === true;
			el.innerHTML = '';
			el.appendChild(E('span', {
				'style': 'display:inline-block;padding:2px 10px;border-radius:3px;color:#fff;background:' +
					(online ? '#2e7d32' : '#c62828')
			}, online ? _('已在线') : _('未登录')));

			if (online && d.userId)
				el.appendChild(E('span', { 'style': 'margin-left:12px' },
					'%s %s ／ %s %s ／ %s %s'.format(_('账号'), d.userId,
						_('IP'), (d.userIp || '-'), 'MAC', (d.userMac || '-'))));
			else if (online)
				el.appendChild(E('span', { 'style': 'margin-left:12px' },
					_('已在线（账号信息暂不可用，下次重登后补齐）')));
			else if (d.message)
				el.appendChild(E('span', { 'style': 'margin-left:12px' }, d.message));

			// Ruijie only accepts a logout request carrying userIndex, and the index
			// is only returned in the login response.
			// When the session was not created by this device the index is empty;
			// disable logout and explain why.
			var btn = document.getElementById('campus-logout-btn');
			if (btn) {
				btn.disabled = online && !d.userIndex;
				btn.title = btn.disabled
					? _('会话索引缺失：锐捷只接受带 userIndex 的注销请求，等下次掉线重登后可用')
					: '';
			}
		});
	},

	render: function() {
		var self = this, m, s, o;

		m = new form.Map('campus_auth', _('校园网认证'),
			_('锐捷 ePortal 网页认证。认证在路由器上完成，LAN 内设备共享同一会话。'));

		s = m.section(form.NamedSection, 'main', 'main', _('账号'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Value, 'username', _('账号'));
		o.rmempty = false;

		o = s.option(form.Value, 'password', _('密码'));
		o.password = true;
		o.rmempty = false;

		o = s.option(form.Value, 'service', _('服务名'), _('多数学校留空即可'));
		o.placeholder = '';

		o = s.option(form.Value, 'portal', _('认证服务器'),
			_('门户基地址，例如 http://10.0.0.1/eportal/ 。未登录时打开任意 http 网站，' +
			  '把跳转后的地址填到这里（保留末尾斜杠）。留空则登录时从跳转地址自动学习。'));
		o.placeholder = 'http://10.0.0.1/eportal/';
		o.rmempty = true;

		o = s.option(form.Value, 'probe', _('探测目标'),
			_('判断是否已在线用的目标，空格分隔。建议用 IP，未认证时不必依赖 DNS。'));
		o.placeholder = '223.5.5.5 119.29.29.29 www.baidu.com';
		o.rmempty = true;

		o = s.option(form.Value, 'iface', _('上行接口'), _('校园网所在的接口名'));
		o.placeholder = 'br-lan-switch';

		o = s.option(form.Flag, 'auto', _('自动重登'), _('每 5 分钟检测一次，掉线后自动登录'));

		return m.render().then(function(node) {
			node.appendChild(E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('运行状态')),
				E('div', { 'class': 'cbi-section-node' }, [
					E('div', { 'class': 'cbi-value' }, [
						E('div', { 'class': 'cbi-value-title' }, _('当前状态')),
						E('div', { 'class': 'cbi-value-field', 'id': 'campus-auth-status' }, _('读取中…'))
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('div', { 'class': 'cbi-value-title' }, _('操作')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('button', {
								'class': 'cbi-button cbi-button-action',
								'click': ui.createHandlerFn(self, 'call', 'login')
							}, _('立即登录')),
							' ',
							E('button', {
								'class': 'cbi-button cbi-button-reset',
								'id': 'campus-logout-btn',
								'click': ui.createHandlerFn(self, 'call', 'logout')
							}, _('注销'))
						])
					])
				])
			]));

			self.refresh();
			poll.add(L.bind(self.refresh, self), 15);
			return node;
		});
	}
});
