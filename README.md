# Life Toolbox for TOS 7

这是 `life-toolbox` 的 TOS 7 单包应用源码，当前版本为 `1.0.005`。

应用采用 WebUI 内部打开模式，前端通过 TOS 平台代理访问本地 Python 服务：

```text
浏览器
  -> /v2/proxy/life-toolbox/...
  -> /var/api/life-toolbox.sock
  -> Python 3.10 后端
```

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
├── docs/PROJECT_LAYOUT.md
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
dist/life-toolbox_1.0.005_x86_64.deb
dist/life-toolbox_1.0.005_x86_64.deb.sha256
```

也可以直接使用官方 `dpkg-deb` 验证生成结果：

```bash
dpkg-deb --info dist/life-toolbox_1.0.005_x86_64.deb
dpkg-deb --contents dist/life-toolbox_1.0.005_x86_64.deb
```

## 安装前检查

安装包会安装到 `/usr/local/life-toolbox/`，并使用 systemd 服务 `lifetoolbox-system.service`。应用用户由 TOS 平台创建；生命周期脚本不会手工创建用户。

建议按以下顺序验证：

```bash
sudo dpkg -i life-toolbox_1.0.005_x86_64.deb
systemctl status lifetoolbox-system.service
journalctl -u lifetoolbox-system.service -n 100 --no-pager
```

## 发布

每次发布前同时更新：

1. `VERSION`
2. `config.ini` 的 `version`
3. `DEBIAN/control` 的 `Version`
4. `CHANGELOG.md`

然后提交并创建标签：

```bash
git add .
git commit -m "release: v1.0.005"
git tag v1.0.005
git push origin main --tags
```

GitHub Actions 会构建 `x86_64` 和 `aarch64` 包，并将 `.deb` 与 SHA256 文件附加到对应 Release。

## 当前发布地址

仓库地址：`https://github.com/642671/life-toolbox-tos7`

Release 资产用于 TOS Developer Platform 版本提交，平台会从 GitHub Release 下载并校验包文件。
