# Changelog

## 1.0.004 - 2026-10-07

- 基于 TOS 7 最新单包模板重新整理项目结构。
- 将后端拆分为 `calculations.py` 和 `server.py`，保持 Python 3.10 兼容。
- 使用 `secrets` 生成随机选择和密码。
- 增加 Unix Socket、JSON API、信号处理和基础安全响应头。
- 更新 systemd 服务的安全限制、资源配额和日志方式。
- 补齐 14 种 TOS 语言文件。
- 增加 Python 标准库构建脚本，可直接生成 `.deb`。
- 增加单元测试和 GitHub Actions 构建/发布流程。
