# koishi-plugin-jandan

[![npm](https://img.shields.io/npm/v/koishi-plugin-jandan?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-jandan)

每天定时推送煎蛋热榜无聊图 / 随手拍。手动指令按榜单名拉取；单榜合并转发，多榜再包一层嵌套转发。

## 工作区开发

按 [Koishi 工作区开发](https://koishi.chat/zh-CN/guide/develop/workspace.html)：本仓库是**独立插件仓**，官方工作区只用于本地调试，不要把整个工作区提交进来。

```bash
npm init koishi@latest
cd <app>
```

把本仓接到工作区的 `external/jandan`（Windows 可用目录联接）：

```bat
mklink /J external\jandan D:\path\to\koishi-plugin-jandan
```

或：

```bash
npm run clone K4F7/koishi-plugin-jandan
```

然后在工作区根目录：

```bash
yarn dev
```

插件会以 `jandan` 的名字热重载。本仓自己构建、测试：

```bash
npm install
npm test
npm run build
```

`tsc -b` 输出到 `lib/`，GitHub Actions 发布也走这一套，不依赖工作区。

## 配置

控制台只保留这些项：

| 项 | 说明 | 默认 |
| --- | --- | --- |
| `lists` | 定时推送的榜单，可多选 | `['daily']` |
| `hour` / `minute` | 推送时刻（服务器本地时区） | `22:00` |
| `skipGif` | 跳过 GIF | `false` |
| `targets` | 定时推送目标：`platform` / `selfId` / `channelId` / 可选 `guildId` | 空 |

不加 `limit`、`delayMs`、`includeMeta`。每次拉当前榜全部条目，一次发出。

`lists` 可选：`daily`（无聊图）、`4hr`（4 小时）、`pic3days`（3 日）、`pic7days`（7 日）、`ooxx`（随手拍）。

### skipGif

默认 **关闭**（会推 GIF）。打开后跳过：

- URL 路径后缀 `.gif`
- 下载后文件头为 `GIF8`

图从每条 `content` 的 `<img src>` 解析（`images` 经常是空的）。`/mw600/`、`/mw1024/` 会改成 `/large/`，请求带 `Referer: https://jandan.net/top`。

### 多榜嵌套转发

- 每个榜先打成一条 inner forward（每个帖子一个节点，节点作者用原帖 `author`，节点内只放图）
- 只选一个榜：直接发出这条 forward
- 选了多个榜：外层再包一条 `forward`，把各榜的 inner forward  nested 进去，仍然只 `send` 一次

不支持嵌套转发的平台由适配器回退，插件本身仍只构造 `forward`。

## 指令

命令名：`jandan`（别名 `煎蛋`）。必须接榜单名，裸指令只提示用法。发到当前会话，不受 `targets` 限制。

```
jandan 无聊图
jandan 无聊图 随手拍
jandan 4小时 -r
jandan ooxx 4hr
```

| 榜单名 | 含义 |
| --- | --- |
| `daily` / `pic` / `无聊图` | 每日无聊图热榜 |
| `4hr` / `4h` / `4小时` | 4 小时热门 |
| `pic3days` / `3d` / `3日` | 3 日无聊图 |
| `pic7days` / `7d` / `7日` | 7 日无聊图 |
| `ooxx` / `随手拍` | 随手拍热榜 |

- 一个榜：该榜全量打成一条合并转发
- 多个榜：每个榜一条 inner forward，外层再包一层后一次发出
- `-r` / `--random`：从本次选出的榜里随机一张，普通消息发出（不走合并转发）

定时推送只用配置里的 `lists` + `targets`，与指令无关。

## 发布（OIDC Trusted Publishing）

仓库：[`K4F7/koishi-plugin-jandan`](https://github.com/K4F7/koishi-plugin-jandan)

工作流：[`.github/workflows/publish.yml`](.github/workflows/publish.yml)。推送 `v*` tag 后由 GitHub Actions 用 OIDC 发布，**不需要 `NPM_TOKEN`**。

### 你需要在 npm 上完成（无法代做）

1. 打开 [npmjs.com](https://www.npmjs.com/) 登录，进入 `koishi-plugin-jandan` 的包设置（新包可先配 **pending trusted publisher**）
2. 配置 Trusted Publisher：
   - Provider：GitHub Actions
   - Organization or user：`K4F7`
   - Repository：`koishi-plugin-jandan`
   - Workflow filename：必须是 `publish.yml`（不要带路径）
   - 允许 `npm publish`
3. 新包可先配 pending trusted publisher，再打 `v1.0.0`；若 npm 要求先有包，用一次性 granular token 发首版再切 OIDC
4. 首发成功后建议在包设置里开启「Require 2FA and disallow tokens」

### 打正式版

确认 Trusted Publisher 已配好、`package.json` 的 `version` 与 tag 一致后：

```bash
git tag v1.0.0
git push origin v1.0.0
```

Actions 会 `npm ci` → `npm test` → `npm run build` → `npm publish --access public`，并自动带 provenance。
