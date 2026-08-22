# koishi-plugin-jandan

[![npm](https://img.shields.io/npm/v/koishi-plugin-jandan?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-jandan)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Koishi](https://img.shields.io/badge/Koishi-4-026d4d?style=flat-square)](https://koishi.chat/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/K4F7/koishi-plugin-jandan/pulls)

每天定时推送 [煎蛋](https://jandan.net/) 热榜无聊图 / 随手拍。手动指令按榜单名拉取；整次请求打成一条合并转发（第一条是榜名，后面只发图）。

Push Jandan hot boring pictures and ooxx on a schedule. Manual commands fetch by list name; each request is a single merge-forward.

## Features

- ⏰ **定时推送**：按服务器本地时区，每天在设定时刻向指定会话发送热榜
- 📋 **多榜单**：无聊图、4 小时、3 日、7 日、随手拍，可多选
- 🔁 **合并转发**：一次请求只发一条 forward；第一条是榜名，后面只发图
- 🎲 **随机单张**：指令加 `-r` 从所选榜里随机发一张，不走合并转发
- 🖼️ **原图 URL**：从帖子 `content` 的 `<img src>` 解析图片，`/mw600/`、`/mw1024/` 升为 `/large/`，把 URL 交给适配器（不把图转成 base64）
- 🚫 **跳过 GIF**：默认开启。热榜 GIF 往往很大，容易让转发超时；按 URL 后缀 `.gif` 或文件头 `GIF8` 过滤
- 🌐 **中英别名**：`无聊图` / `daily` / `pic` 等写法均可

## Quick Start

1. 在控制台勾选定时推送的 `lists`，填好 `targets`
2. 到点会自动推送；也可在会话里手动拉榜

```
jandan 无聊图
jandan 无聊图 随手拍
jandan 4小时 -r
```

依赖 Koishi 的 `http` 服务（`inject: ['http']`）。

## Changelog

当前版本 **1.1.1**：一条合并转发；图片改为 URL 而不是 base64；第一条榜名，后面只发图。`skipGif` 默认开启（热榜 GIF 往往很大）。

## License

[MIT](./LICENSE) © 2026 koishi-plugin-jandan contributors

## Support

- 🐛 Issues：[github.com/K4F7/koishi-plugin-jandan/issues](https://github.com/K4F7/koishi-plugin-jandan/issues)
- 📦 npm：[koishi-plugin-jandan](https://www.npmjs.com/package/koishi-plugin-jandan)
- 📖 Koishi 文档：[koishi.chat](https://koishi.chat/)
