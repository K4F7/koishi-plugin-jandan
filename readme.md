# koishi-plugin-jandan

[![npm](https://img.shields.io/npm/v/koishi-plugin-jandan?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-jandan)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Koishi](https://img.shields.io/badge/Koishi-4-026d4d?style=flat-square)](https://koishi.chat/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/K4F7/koishi-plugin-jandan/pulls)

每天定时推送 [煎蛋](https://jandan.net/) 热榜无聊图 / 随手拍。手动指令按榜单名拉取；单榜合并转发，多榜再包一层嵌套转发。

Push Jandan hot boring pictures and ooxx on a schedule. Manual commands fetch by list name; one list is a single forward, multiple lists nest inside another.

## Features

- ⏰ **定时推送**：按服务器本地时区，每天在设定时刻向指定会话发送热榜
- 📋 **多榜单**：无聊图、4 小时、3 日、7 日、随手拍，可多选
- 🔁 **合并转发**：单榜一条 forward；多榜再包一层嵌套转发，一次发出
- 🎲 **随机单张**：指令加 `-r` 从所选榜里随机发一张，不走合并转发
- 🖼️ **原图下载**：从帖子 `content` 的 `<img src>` 解析图片，`/mw600/`、`/mw1024/` 升为 `/large/`
- 🚫 **跳过 GIF**：可选按 URL 后缀 `.gif` 或文件头 `GIF8` 过滤
- 🌐 **中英别名**：`无聊图` / `daily` / `pic` 等写法均可

## Quick Start

在 [Koishi](https://koishi.chat/) 控制台搜索 `jandan` 安装，或：

```bash
npm install koishi-plugin-jandan
```

启用插件后：

1. 在控制台勾选定时推送的 `lists`，填好 `targets`
2. 到点会自动推送；也可在会话里手动拉榜

```
jandan 无聊图
jandan 无聊图 随手拍
jandan 4小时 -r
```

依赖 Koishi 的 `http` 服务（`inject: ['http']`）。

## Installation

### Prerequisites

- [Koishi](https://koishi.chat/) `^4.18.7`
- Node.js 18 或更高（发布流水线使用 Node 24）

### Package Manager

```bash
# npm
npm install koishi-plugin-jandan

# pnpm
pnpm add koishi-plugin-jandan

# yarn
yarn add koishi-plugin-jandan
```

安装后在控制台启用插件 `jandan`。

### From Source

```bash
git clone https://github.com/K4F7/koishi-plugin-jandan.git
cd koishi-plugin-jandan
npm install
npm test
npm run build
```

`tsc -b` 输出到 `lib/`。GitHub Actions 发布也走这一套。

## Usage

### 指令

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

### 多榜嵌套转发

- 每个榜先打成一条 inner forward（每个帖子一个节点，节点作者用原帖 `author`，节点内只放图）
- 只选一个榜：直接发出这条 forward
- 选了多个榜：外层再包一条 `forward`，把各榜的 inner forward nested 进去，仍然只 `send` 一次

不支持嵌套转发的平台由适配器回退，插件本身仍只构造 `forward`。

### skipGif

默认 **关闭**（会推 GIF）。打开后跳过：

- URL 路径后缀 `.gif`
- 下载后文件头为 `GIF8`

图从每条 `content` 的 `<img src>` 解析（接口里的 `images` 经常是空的）。请求带 `Referer: https://jandan.net/top`。

## Configuration

控制台只保留这些项。不加 `limit`、`delayMs`、`includeMeta`。每次拉当前榜全部条目，一次发出。

| 项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `lists` | `ListKind[]` | `['daily']` | 定时推送的榜单，可多选 |
| `hour` | `number` (0–23) | `22` | 推送小时（服务器本地时区） |
| `minute` | `number` (0–59) | `0` | 推送分钟 |
| `skipGif` | `boolean` | `false` | 跳过 GIF |
| `targets` | `Target[]` | `[]` | 定时推送目标 |

`lists` 可选：`daily`、`4hr`、`pic3days`、`pic7days`、`ooxx`。

### Target

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `platform` | `string` | 是 | 平台名称 |
| `selfId` | `string` | 是 | 机器人 ID |
| `channelId` | `string` | 是 | 频道 / 群聊 ID |
| `guildId` | `string` | 否 | 群组 ID |

没有可用 bot 时会打日志 `no bot for <platform>:<selfId>` 并跳过该目标。

## API Reference

插件入口导出 `name`、`inject`、`Config`、`apply`。拉榜与组消息的纯逻辑在 `src/jandan.ts`。

### `parseListNames(input)`

把空格分隔的榜单名解析成去重后的 `ListKind[]`，未知词放进 `unknown`。以 `-` 开头的 token 视为 flag，忽略。

### `buildPayload(http, kinds, skipGif)`

按顺序拉榜、下图、过滤空榜，返回 `{ label, posts }[]`。

### `composeForward(prepared)`

一个榜返回该榜的 forward；多个榜再包一层嵌套 forward。

### `pickRandomImage(lists)`

从已准备好的帖子里随机抽一张图。没有图时返回 `null`。

## Architecture

```
src/
├── index.ts     # 插件入口：指令、定时、发往 targets
└── jandan.ts    # 拉榜、解析 img、下载、MIME、组 forward
tests/
└── jandan.spec.ts
```

数据流：煎蛋 top API → 解析 `<img src>` → 升大图 URL → 下载（可选跳过 GIF）→ 按作者组节点 → `h('message', { forward: true })`。

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

## FAQ

<details>
<summary><strong>为什么裸打 <code>jandan</code> 没有图？</strong></summary>

指令必须带榜单名。裸指令只会返回用法提示。
</details>

<details>
<summary><strong>定时推送没发出去？</strong></summary>

检查 `targets` 是否填了 `platform` / `selfId` / `channelId`，以及对应 bot 是否在线。`lists` 为空或 `targets` 为空时定时任务会直接跳过。时刻按**服务器本地时区**计算。
</details>

<details>
<summary><strong>为什么有的平台看不到嵌套转发？</strong></summary>

插件只构造 Koishi 的 `forward` 元素。不支持嵌套转发的平台由适配器回退，不是插件另发多条消息。
</details>

<details>
<summary><strong>图片从哪里来？</strong></summary>

从每条帖子 `content` 里的 `<img src>` 解析。接口字段 `images` 经常为空，插件不依赖它。
</details>

## Troubleshooting

**没有可发送的图片**

该榜当前没有可下载的图，或全部被 `skipGif` 滤掉了。换一个榜或关掉 `skipGif` 再试。

**拉取出错了，一会儿再试**

煎蛋 API 或图床请求失败。看 Koishi 日志里的 `jandan` logger。请求带 `Referer: https://jandan.net/top`。

**no bot for platform:selfId**

`targets` 里的 `platform` / `selfId` 和实际登录的 bot 对不上。

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

## Contributing

欢迎提 issue 和 PR。

1. Fork 仓库，建分支：`git checkout -b feat/my-change`
2. 改代码，补测试（`tests/jandan.spec.ts`）
3. `npm test` 和 `npm run build` 通过
4. 开 Pull Request

提交信息建议用 [Conventional Commits](https://www.conventionalcommits.org/)：`feat:` / `fix:` / `docs:` / `test:` / `chore:`。

## Changelog

当前版本 **1.0.0**：定时推送煎蛋热榜、手动指令、合并 / 嵌套转发、随机单张、可选跳过 GIF。

## License

[MIT](./LICENSE) © 2026 koishi-plugin-jandan contributors

## Support

- 🐛 Issues：[github.com/K4F7/koishi-plugin-jandan/issues](https://github.com/K4F7/koishi-plugin-jandan/issues)
- 📦 npm：[koishi-plugin-jandan](https://www.npmjs.com/package/koishi-plugin-jandan)
- 📖 Koishi 文档：[koishi.chat](https://koishi.chat/)
