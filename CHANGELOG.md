# Changelog

## 1.0.008 - 2026-10-17

- 解决“安装成功但服务从未启动”这类最难自查的问题：`postinst` 不再只执行一次
  `systemctl start … || true` 就宣布安装完成，而是先校验启动前置条件
  （unit 文件、`bin/life-toolbox-service` 启动器、`/usr/bin/python3`），再轮询
  `systemctl is-active` 与 `/var/api/life-toolbox.sock` 是否真正就绪（最长 25 秒）。
- 前置条件缺失或 25 秒内未就绪时，`postinst` 生成
  `/usr/local/life-toolbox/logs/postinst-diagnostic.txt`：包含应用用户身份、启动前置条件清单、
  `systemctl is-active/status/cat` 输出、最近 120 行 `journalctl` 与 socket 状态，
  同时在安装日志输出 `ERROR` 级消息和下一步命令。脚本仍以 0 退出，避免把包留在
  “半配置”状态而无法卸载或升级。
- `postinst` 在启动前执行 `systemctl reset-failed`：上一版本崩溃循环耗尽 `StartLimitBurst`
  之后，systemd 会拒绝后续所有启动请求，现象正是“重装也起不来”。
- `webui.bz2` 解压失败不再中断 `configure`（此前 `set -e` 会把包停在半配置状态，
  并把真正原因——损坏的压缩包——藏在 dpkg 报错之后），改为记录 `ERROR` 并提示
  WebUI 可能仍是旧版本；每次 `configure` 仍重新解压，避免升级后继续服务旧前端。
- `prerm` 由“`systemctl stop/disable … || true`”改为可验证停用：停止后轮询确认进程真的
  退出（最长 14 秒），仍存活则升级 `systemctl kill` 发送 SIGKILL，再 `disable`。
  解决 App Center 显示已停用、但守护进程与 socket 仍然存在（Codex 记录的未完成项）。
- `prerm`/`postrm` 的 socket 清理加失败保护：`/var/api` 实机是 `1777` sticky 目录，
  别人属主的 socket 无法 unlink，未保护的 `rm -f` 会在 `set -e` 下中断脚本，
  使其后的 `disable`、`daemon-reload`、`userdel` 永不执行。
- `prerm` 的 shebang 由 `#!/bin/bash` 改为 `#!/bin/sh`，与 dpkg 实际调用的 shell 一致；
  三个生命周期脚本统一复核为 POSIX sh，不使用 `install -d`（TOS 自带的
  `/usr/bin/install` 会拒绝该用法）、`realpath`、`cp -a`。
- 前端新增“后端服务未运行”恢复指引：健康检查失败时展示具体失败原因、应用中心
  停用/重新启用步骤、本应用真实的 `systemctl status lifetoolbox-system.service` 命令与诊断文件
  绝对路径，并提供“重试连接”按钮；重新连通后自动收起。指引条不占用顶部 56px
  标题栏，也不覆盖右下角 20×20 窗口缩放安全区。
- 新增 `backend/tests/test_lifecycle_scripts.py`，把上述实机结论固化为回归断言：
  POSIX sh 与禁用 bash 语法、禁用 TOS 上不可用的命令、启动前置条件检查、
  `reset-failed` 必须先于 `start`、就绪轮询同时看 unit 与 socket、诊断文件路径与页面文案
  一致、停用必须确认并升级、socket 清理必须可失败、`/var/api` 只创建不收紧。
- 14 种语言的 `release_note` 更新至本版本。

## 1.0.007 - 2026-10-17

- systemd 单元按官方 v2.7 规范与 TOS 7 实机行为重新校准：`TimeoutStopSec` 5 → 10（规范 8.12 必需值），
  `Restart` 由 `no` 改为 `on-failure` + `RestartSec=10`（规范 8.7.1：App Center 遵循开发者重启策略，
  崩溃可自愈；正常停用退出码为 0，不会被重新拉起）。
- 继续省略 `Group=<appid>` 与 `PrivateTmp=true`，并在 unit 内写明实机证据：
  TOS 7 只创建应用用户（主组 `allusers`）、不创建同名组，声明 `Group=` 会 `status=216/GROUP`；
  `/var/api` 是指向 `/tmp/api` 的符号链接，`PrivateTmp` 会 `status=226/NAMESPACE`。
- `postinst` 不再修改共享目录 `/var/api` 的属主和权限（实机为 `1777` sticky，应用用户本就能建自己的
  socket；规范 10.6 与 16.2 禁止应用改动共享权限，收窄成 `0770` 还会危及其他 iframe 应用与平台自身 socket），
  仅在该目录真正缺失时按 `1777` 创建。
- 实机注入残留 socket 后发现并修复两处启动/停用健壮性问题：`_remove_stale_socket()` 改用
  `os.path.lexists()`（悬空符号链接会被 `os.path.exists()` 判为不存在，随后 bind 以 `EADDRINUSE` 失败），
  并且当 sticky 目录不允许 unlink 时输出一条可执行的 `ERROR` 日志后以状态 1 退出，不再抛 `PermissionError`
  回溯；unit 的 `ExecStopPost` 加 `-` 前缀，避免清理失败把一次正常停用记成
  `Control process exited, status=1/FAILURE`（App Center 停用失败）。
- 新增 `backend/tests/test_socket_lifecycle.py` 覆盖以上 socket 生命周期行为。
- 新增 `backend/tests/test_package_contract.py`：把 v2.7 规范条目和上述实机结论固化为回归断言
  （config.ini 必填与互斥、版本五处同步、14 语言、图标 viewBox/大小、LF 与无 BOM、unit 指令、
  postinst/prerm/postrm 行为）。
- 14 种语言的 `release_note` 更新至本版本。



## 1.0.006 - 2026-10-08

- 增加安装时应用用户缺失的兼容补建路径，修复新机器安装后 systemd 报 `217/USER`、启用失败的问题。

## 1.0.005 - 2026-10-08

- 修复 TOS 升级后仍加载首次解压 WebUI 的问题，安装和升级时重新解压前端。
- 应用内容边界铺满 TOS 窗口，仅保留宿主标题栏和右下缩放安全角。
- 移除 systemd 同名组依赖和 `PrivateTmp`，修复启用、停用失败。
- 修复共享 `/var/api` socket 目录权限和前端代理路径兼容。

## 1.0.004 - 2026-10-07

- 基于 TOS 7 最新单包模板重新整理项目结构。
- 将后端拆分为 `calculations.py` 和 `server.py`，保持 Python 3.10 兼容。
- 使用 `secrets` 生成随机选择和密码。
- 增加 Unix Socket、JSON API、信号处理和基础安全响应头。
- 更新 systemd 服务的安全限制、资源配额和日志方式。
- 补齐 14 种 TOS 语言文件。
- 增加 Python 标准库构建脚本，可直接生成 `.deb`。
- 增加单元测试和 GitHub Actions 构建/发布流程。
