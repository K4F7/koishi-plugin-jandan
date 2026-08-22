import { Bot, Context, Element, Schema, Session, h } from 'koishi'
import {
  DEFAULT_MAX_IMAGE_BYTES,
  ListKind,
  buildPayload,
  composeForward,
  parseListNames,
  pickRandomImage,
} from './jandan'

export const name = 'jandan'

export const inject = ['http']

export const usage = `
定时推送煎蛋热榜。手动指令：\`jandan <榜单名...>\`，加 \`-r\` 随机单张。

榜单：无聊图 / 随手拍 / 4小时 / 3日 / 7日
`

export const DEFAULT_WAIT_TIP = '正在解析煎蛋热榜…'

const ListKindSchema = Schema.union([
  Schema.const('daily').description('每日无聊图'),
  Schema.const('4hr').description('4 小时热门'),
  Schema.const('pic3days').description('3 日无聊图'),
  Schema.const('pic7days').description('7 日无聊图'),
  Schema.const('ooxx').description('随手拍'),
])

export interface Target {
  platform: string
  selfId: string
  channelId: string
  guildId?: string
}

export interface Config {
  lists: ListKind[]
  hour: number
  minute: number
  skipGif: boolean
  maxImageMB: number
  waitTip: string
  targets: Target[]
}

export const Config: Schema<Config> = Schema.object({
  lists: Schema.array(ListKindSchema).role('select').default(['daily']).description('定时推送的榜单。多个榜打进同一条合并转发，只发图。'),
  hour: Schema.number().min(0).max(23).default(22).description('推送小时（服务器本地时区）。'),
  minute: Schema.number().min(0).max(59).default(0).description('推送分钟。'),
  skipGif: Schema.boolean().default(true).description('跳过全部 GIF。热榜 GIF 常见 5–27MB；关闭后仍受单张体积上限约束，超限的丢。'),
  maxImageMB: Schema.number().min(0).max(50).default(DEFAULT_MAX_IMAGE_BYTES / 1024 / 1024).description('单张图片最大体积（MB）。超过则跳过该张，0 表示不限制。静态图一般远低于此值。'),
  waitTip: Schema.string().default(DEFAULT_WAIT_TIP).description('下载、转码前先发这条提示，热榜发出后再尝试撤回。留空则不发。'),
  targets: Schema.array(Schema.object({
    platform: Schema.string().required().description('平台名称。'),
    selfId: Schema.string().required().description('机器人 ID。'),
    channelId: Schema.string().required().description('频道 ID。'),
    guildId: Schema.string().description('群组 ID。'),
  })).role('table').description('定时推送目标。'),
})

function msUntil(hour: number, minute: number) {
  const now = new Date()
  const next = new Date(now)
  next.setHours(hour, minute, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

export function isAdapterTimeout(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return /Timeout with request/i.test(text)
}

function shortError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return text.split(', args:')[0]
}

function firstMessageId(result: string | string[] | void | null) {
  if (Array.isArray(result)) return result[0]
  return result || undefined
}

async function recall(bot: { deleteMessage(channelId: string, id: string): Promise<void> }, channelId?: string, id?: string) {
  if (!id || !channelId) return
  try {
    await bot.deleteMessage(channelId, id)
  } catch {
    // 部分协议端不允许撤回
  }
}

const USAGE = '用法：jandan <榜单名...> [-r]\n榜单：无聊图 / 随手拍 / 4小时 / 3日 / 7日（也可用 daily / ooxx / 4hr / 3d / 7d）'

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('jandan')
  const waitTip = config.waitTip?.trim() ?? ''

  function logSendError(error: unknown) {
    if (isAdapterTimeout(error)) {
      logger.warn('%s；合并转发可能仍会发出，适配器 responseTimeout 调大可去掉这条警告', shortError(error))
      return
    }
    logger.warn(error)
  }

  async function sendWait(session: Session) {
    if (!waitTip) return undefined
    try {
      const content = session.messageId ? `${h.quote(session.messageId)}${waitTip}` : waitTip
      return firstMessageId(await session.send(content))
    } catch (error) {
      logger.warn(error)
      return undefined
    }
  }

  function findTargetBot(target: Target) {
    const bot = ctx.bots.find(item => item.platform === target.platform && item.selfId === target.selfId)
    if (!bot) logger.warn('no bot for %s:%s', target.platform, target.selfId)
    return bot
  }

  async function notifyTargets(content: string) {
    const sent: { bot: Bot; channelId: string; id?: string }[] = []
    for (const target of config.targets) {
      const bot = findTargetBot(target)
      if (!bot) continue
      try {
        sent.push({
          bot,
          channelId: target.channelId,
          id: firstMessageId(await bot.sendMessage(target.channelId, content, target.guildId)),
        })
      } catch (error) {
        logger.warn(error)
      }
    }
    return sent
  }

  async function sendToTargets(content: Element) {
    for (const target of config.targets) {
      const bot = findTargetBot(target)
      if (!bot) continue
      try {
        await bot.sendMessage(target.channelId, content, target.guildId)
      } catch (error) {
        logSendError(error)
      }
    }
  }

  async function buildMessage(kinds: ListKind[], random: boolean) {
    const prepared = await buildPayload(ctx.http, kinds, {
      skipGif: config.skipGif,
      maxBytes: config.maxImageMB > 0 ? Math.floor(config.maxImageMB * 1024 * 1024) : 0,
    })
    if (!prepared.length) return null
    if (random) {
      const image = pickRandomImage(prepared.map(item => item.posts))
      if (!image) return null
      return h.image(image.data, image.mime)
    }
    return composeForward(prepared)
  }

  ctx.command('jandan [...names:string]', '获取煎蛋热榜')
    .alias('煎蛋')
    .option('random', '-r 从所选榜随机发送一张')
    .action(async ({ session, options }, ...names) => {
      if (!session) return
      const input = names.filter(Boolean).join(' ')
      if (!input) return USAGE
      const { lists, unknown } = parseListNames(input)
      if (unknown.length) return `未知榜单：${unknown.join('、')}\n${USAGE}`
      if (!lists.length) return USAGE
      const waitId = await sendWait(session)
      let payload: Element | null
      try {
        payload = await buildMessage(lists, !!options?.random)
      } catch (error) {
        logger.warn(error)
        await recall(session.bot, session.channelId, waitId)
        return '拉取出错了，一会儿再试。'
      }
      if (!payload) {
        await recall(session.bot, session.channelId, waitId)
        return '没有可发送的图片。'
      }
      try {
        await session.send(payload)
      } catch (error) {
        logSendError(error)
        // OneBot 合并转发常在协议端已发出后才超时；再回一条失败提示会刷屏。
        if (!isAdapterTimeout(error)) {
          await recall(session.bot, session.channelId, waitId)
          return '发送失败了，一会儿再试。OneBot 超时可把适配器 responseTimeout 调大。'
        }
      }
      await recall(session.bot, session.channelId, waitId)
    })

  const schedule = async () => {
    if (!config.targets.length || !config.lists.length) return
    const notices = waitTip ? await notifyTargets(waitTip) : []
    try {
      const payload = await buildMessage(config.lists, false)
      if (payload) await sendToTargets(payload)
    } catch (error) {
      logger.warn(error)
    } finally {
      for (const notice of notices) {
        await recall(notice.bot, notice.channelId, notice.id)
      }
    }
  }

  const tick = async () => {
    await schedule()
    ctx.setTimeout(tick, msUntil(config.hour, config.minute))
  }

  ctx.setTimeout(tick, msUntil(config.hour, config.minute))
}
