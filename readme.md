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

1. 在控制台勾选定时推送的 `lists`，填好 `targets`
2. 到点会自动推送；也可在会话里手动拉榜

```
jandan 无聊图
jandan 无聊图 随手拍
jandan 4小时 -r
```

依赖 Koishi 的 `http` 服务（`inject: ['http']`）。


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



## Changelog

当前版本 **1.0.0**：定时推送煎蛋热榜、手动指令、合并 / 嵌套转发、随机单张、可选跳过 GIF。

## License

[MIT](./LICENSE) © 2026 koishi-plugin-jandan contributors

## Support

- 🐛 Issues：[github.com/K4F7/koishi-plugin-jandan/issues](https://github.com/K4F7/koishi-plugin-jandan/issues)
- 📦 npm：[koishi-plugin-jandan](https://www.npmjs.com/package/koishi-plugin-jandan)
- 📖 Koishi 文档：[koishi.chat](https://koishi.chat/)
