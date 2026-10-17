# Changelog

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
