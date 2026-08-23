# koishi-plugin-jandan

[![npm](https://img.shields.io/npm/v/koishi-plugin-jandan?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-jandan)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Koishi](https://img.shields.io/badge/Koishi-4-026d4d?style=flat-square)](https://koishi.chat/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/K4F7/koishi-plugin-jandan/pulls)

推送煎蛋梗图，快乐摸鱼。手动指令按榜单名拉取；整次请求打成一条合并转发（第一条是榜名，后面只发图）。

Push Jandan memes and slack off happily. Manual commands fetch by list name; each request is a single merge-forward.

## Features

- ⏰ **定时推送**：按服务器本地时区，每天在设定时刻向指定会话发送热榜
- 📋 **多榜单**：无聊图、4 小时、3 日、7 日、随手拍，可多选
- 🔁 **合并转发**：一次请求只发一条 forward；第一条是榜名，后面只发图
- 🎲 **随机单张**：指令加 `-r` 从所选榜里随机发一张，不走合并转发
- 🐟 **摸鱼**：`摸鱼` / `moyu` 从无聊图热榜随机发一帖的全部图片
- 🖼️ **下载原图再发**：从帖子 `content` 的 `<img src>` 解析图片，`/mw600/`、`/mw1024/` 升为 `/large/`，带 Referer 并发下载后原样交给适配器
- 🚀 **正式转发**：直接发一条「标题 + 一帖一节点」的合并转发；同一帖多图打进同一个气泡
- ⏳ **先发「正在解析」**：下载完成后再发合并转发，提示默认不撤回。发送时把 OneBot `responseTimeout` 临时调到 10 分钟，避免协议端还在传图时适配器 60 秒误报超时
- 🚫 **跳过 GIF**：默认开启。热榜 GIF 常见 5–27MB；关闭后仍按单张上限（默认 10MB）丢超限的图
- 🌐 **中英别名**：`无聊图` / `daily` / `pic` 等写法均可

## Quick Start

1. 在控制台勾选定时推送的 `lists`，填好 `targets`
2. 到点会自动推送；也可在会话里手动拉榜

```
jandan 无聊图
jandan 无聊图 随手拍
jandan 4小时 -r
摸鱼
```

依赖 Koishi 的 `http` 服务（`inject: ['http']`）。

## Changelog

当前版本 **1.2.9**：`摸鱼` 不再发送「正在解析煎蛋热榜…」等待提示，直接拉图发出。

## License

[MIT](./LICENSE) © 2026 koishi-plugin-jandan contributors

## Support

- 🐛 Issues：[github.com/K4F7/koishi-plugin-jandan/issues](https://github.com/K4F7/koishi-plugin-jandan/issues)
- 📦 npm：[koishi-plugin-jandan](https://www.npmjs.com/package/koishi-plugin-jandan)
- 📖 Koishi 文档：[koishi.chat](https://koishi.chat/)
