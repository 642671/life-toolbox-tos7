# Life Toolbox for TOS 7

这是 `life-toolbox` 的 TOS 7 单包应用源码，当前版本为 `1.0.009`。

应用采用 WebUI 内部打开模式，前端通过 TOS 平台代理访问本地 Python 服务：

```text
浏览器
  -> /v2/proxy/life-toolbox/...
  -> /var/api/life-toolbox.sock
  -> Python 3.10 后端
```

代理根不写死一种：前端按规范允许的几种形式顺序探测，用回包里的 `app` 字段确认"这确实是本应用"，
选中后复用。请求失败时页面按四类成因分别提示——网络层被浏览器或平台拦下、TOS 会话未生效、
平台代理没有转到本应用、后端确实返回错误——并列出实际失败的请求地址；只有最后一类才说
"后端服务未运行"。实机上未登录时平台对任意 `/v2/...` 路径回的是 HTTP 200 +
`{"is_login":false,"code_num":117}`，所以判据必须是回包内容而不是状态码。

所有计算都在本地完成，不需要互联网连接。

## 功能

- 日期差计算
- 长度和重量单位换算
- BMI 估算
- 折扣、税额和最终价格计算
- 小费分摊
- 油耗和油费估算
- 等额本息贷款估算
- 安全随机选择
- 随机密码生成

## 目录结构

```text
life-toolbox-tos7/
├── .github/workflows/build.yml   # CI，构建并发布 .deb
├── backend/
│   ├── life-toolbox-service      # 安装包中的 bin 入口
│   ├── life_toolbox/
│   │   ├── __init__.py
│   │   ├── calculations.py       # 纯计算函数，适合学习 Python
│   │   └── server.py             # Unix Socket HTTP 服务
│   └── tests/test_calculations.py
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── images/icons/life-toolbox.svg
├── init.d/lifetoolbox-system.service
├── DEBIAN/
│   ├── control
│   ├── postinst
│   ├── prerm
│   └── postrm
├── docs/
│   ├── PROJECT_LAYOUT.md
│   └── TOS7_SPEC_COMPLIANCE_CN.md
├── config.ini                     # TOS 应用元数据，内容为 JSON
├── life-toolbox.lang              # TOS 要求的 14 种语言
├── life-toolbox.env
├── build.py                       # 纯 Python 标准库构建脚本
├── VERSION
└── CHANGELOG.md
```

## Python 后端说明

TOS 7 预装 Python 3.10，因此 Deb 应用可以直接使用 `/usr/bin/python3`，不需要安装 Node.js、Java 或额外运行时。

`backend/life_toolbox/calculations.py` 是独立计算模块，每个函数只接收普通参数并返回字典，适合先阅读和练习。`backend/life_toolbox/server.py` 负责：

- 创建和监听 `/var/api/life-toolbox.sock`
- 接收来自 TOS 代理的 HTTP 请求
- 调用计算函数
- 返回 JSON
- 在收到 `SIGTERM` 时优雅退出

本地测试计算函数：

```bash
python -m unittest discover -s backend/tests -v
```

## 构建

对官方规范的逐条符合性、在真实 TOS 7 上的实测证据，以及三处刻意的规范偏离，
见 [TOS 7 规范符合性说明](docs/TOS7_SPEC_COMPLIANCE_CN.md)。

当前构建脚本只使用 Python 标准库，不要求本机安装 `dpkg-deb`。

```bash
# x86_64
python build.py --platform x86_64

# aarch64
python build.py --platform aarch64
```

Windows PowerShell 如果没有可用的 `python` 命令，可以把上面的
`python` 替换为 `py -3`。

生成文件：

```text
dist/life-toolbox_1.0.009_x86_64.deb
dist/life-toolbox_1.0.009_x86_64.deb.sha256
```

也可以直接使用官方 `dpkg-deb` 验证生成结果：

```bash
dpkg-deb --info dist/life-toolbox_1.0.009_x86_64.deb
dpkg-deb --contents dist/life-toolbox_1.0.009_x86_64.deb
```

## 安装前检查

安装包会安装到 `/usr/local/life-toolbox/`，并使用 systemd 服务 `lifetoolbox-system.service`。应用用户正常由 TOS 平台创建；`postinst` 只在平台没有创建该用户时才补建一个同名的系统用户（不覆盖已存在的用户），避免侧载安装时服务以 `217/USER` 失败。

建议按以下顺序验证：

```bash
sudo dpkg -i life-toolbox_1.0.009_x86_64.deb
systemctl status lifetoolbox-system.service
journalctl -u lifetoolbox-system.service -n 100 --no-pager
```

## 发布

每次发布前同时更新：

1. `VERSION`
2. `config.ini` 的 `version`
3. `DEBIAN/control` 的 `Version`
4. `backend/life_toolbox/__init__.py` 的 `__version__`
5. `frontend/index.html` 的 `styles.css?v=` 与 `app.js?v=`
6. `life-toolbox.lang` 中 14 种语言的 `release_note`
7. `CHANGELOG.md`

版本号一致性由 `backend/tests/test_package_contract.py` 自动校验，漏改任何一处都会在测试和 `build.py` 阶段失败。

然后提交并创建标签：

```bash
git add .
git commit -m "release: v1.0.009"
git tag v1.0.009
git push origin main --tags
```

GitHub Actions 会构建 `x86_64` 和 `aarch64` 包，并将 `.deb` 与 SHA256 文件附加到对应 Release。

## 当前发布地址

仓库地址：`https://github.com/642671/life-toolbox-tos7`

Release 资产用于 TOS Developer Platform 版本提交，平台会从 GitHub Release 下载并校验包文件。
