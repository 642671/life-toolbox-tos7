# 目录结构与打包流程

## 1. 开发目录和安装目录的关系

仓库中的源码目录是开发结构，`.deb` 安装后统一进入：

```text
/usr/local/life-toolbox/
├── config.ini
├── bin/life-toolbox-service
├── lib/life_toolbox/
├── life-toolbox.lang
├── life-toolbox.env
├── images/icons/life-toolbox.svg
├── init.d/lifetoolbox-system.service
├── webui.bz2
├── data/
└── logs/
```

`/usr/local/life-toolbox/` 是应用看到的逻辑路径。TOS 平台安装时会将它映射到用户选择的数据卷，应用代码和配置中不应写死 `/Volume*/...`。

## 2. 构建过程

`build.py` 执行以下步骤：

1. 读取并校验 `config.ini`。
2. 检查语言文件是否包含 TOS 规定的 14 个 section。
3. 检查 SVG 图标的大小、XML 结构和危险标签。
4. 将后端 Python 模块和前端文件复制到临时 staging 目录。
5. 将前端压缩为安装规范要求的 `webui.bz2`。
6. 同步 `VERSION`、`config.ini` 和 `DEBIAN/control` 的版本与架构。
7. 生成 `control.tar.gz` 和 `data.tar.gz`。
8. 使用 Python 写入 Debian 的 `ar` 容器，生成最终 `.deb`。

## 3. 运行过程

```text
TOS App Center
  -> systemd 启动 lifetoolbox-system.service
  -> Python 进程创建 /var/api/life-toolbox.sock
  -> TOS 将前端请求代理到 /v2/proxy/life-toolbox/<action>
  -> Python 返回 JSON
```

前端不会直接访问 socket 文件，也不会依赖外部 CDN。

## 4. Python 学习建议

建议按以下顺序阅读：

1. `backend/life_toolbox/calculations.py`：基础函数、参数校验、字典返回。
2. `backend/tests/test_calculations.py`：如何使用 `unittest` 验证函数。
3. `backend/life_toolbox/server.py`：HTTP 请求、JSON、Unix Socket 和信号处理。
4. `frontend/app.js`：前端如何调用 Python API。
5. `build.py`：如何用标准库处理文件、路径、压缩和 Debian 包。

修改计算逻辑时，先增加或修改测试，再修改 `calculations.py`，最后重新运行：

```bash
python -m unittest discover -s backend/tests -v
python build.py --platform x86_64
```
