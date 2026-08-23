import { Bot, Context, Element, Schema, Session, h } from 'koishi'
import {
  DEFAULT_MAX_IMAGE_BYTES,
  ListKind,
  PreparedList,
  buildPayload,
  composeForwardEach,
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
export const DEFAULT_SEND_TIMEOUT = 10 * 60 * 1000

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
  skipGif: boolean
  maxImageMB: number
  waitTip: string
  sendTimeout: number
  targets: Target[]
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    lists: Schema.array(ListKindSchema).role('select').default(['daily']).description('定时推送的榜单。多个榜打进同一条合并转发，只发图'),
  }),
  Schema.object({
    hour: Schema.number().min(0).max(23).default(22).description('小时'),
  }).description('推送时间'),
  Schema.object({
    skipGif: Schema.boolean().default(true).description('跳过 gif 图'),
    maxImageMB: Schema.number().min(0).max(50).default(DEFAULT_MAX_IMAGE_BYTES / 1024 / 1024).description('单张图片最大体积（MB）'),
    waitTip: Schema.string().default(DEFAULT_WAIT_TIP).description('等待信息'),
    sendTimeout: Schema.number().min(0).role('time').default(DEFAULT_SEND_TIMEOUT).description('发送超时（毫秒）'),
    targets: Schema.array(Schema.object({
      platform: Schema.string().required().description('平台名称'),
      selfId: Schema.string().required().description('机器人 ID'),
      channelId: Schema.string().required().description('频道 ID'),
      guildId: Schema.string().description('群组 ID'),
    })).role('table').description('定时推送目标'),
  }),
])

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

export async function withResponseTimeout<T>(
  bot: { config: { responseTimeout?: number } },
  timeout: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (!timeout || !('responseTimeout' in bot.config)) return fn()
  const config = bot.config
  const prev = config.responseTimeout
  config.responseTimeout = Math.max(prev ?? 0, timeout)
  const applied = config.responseTimeout
  try {
    return await fn()
  } finally {
    if (config.responseTimeout === applied) config.responseTimeout = prev
  }
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
    for (const target of config.targets) {
      const bot = findTargetBot(target)
      if (!bot) continue
      try {
        await bot.sendMessage(target.channelId, content, target.guildId)
      } catch (error) {
        logger.warn(error)
      }
    }
  }

  async function sendPayload(bot: Bot, send: () => Promise<unknown>) {
    try {
      const result = await withResponseTimeout(bot, config.sendTimeout, send)
      return { id: firstMessageId(result as string | string[] | void | null) }
    } catch (error) {
      logSendError(error)
      return { error }
    }
  }

  async function sendHotlist(
    bot: Bot,
    prepared: PreparedList[],
    send: (payload: Element) => Promise<unknown>,
  ) {
    return sendPayload(bot, () => send(composeForwardEach(prepared))).then(result => result.error)
  }

  async function sendToTargets(prepared: PreparedList[]) {
    for (const target of config.targets) {
      const bot = findTargetBot(target)
      if (!bot) continue
      await sendHotlist(
        bot,
        prepared,
        payload => bot.sendMessage(target.channelId, payload, target.guildId),
      )
    }
  }

  async function loadPrepared(kinds: ListKind[]) {
    return buildPayload(ctx.http, kinds, {
      skipGif: config.skipGif,
      maxBytes: config.maxImageMB > 0 ? Math.floor(config.maxImageMB * 1024 * 1024) : 0,
    })
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
      let prepared: PreparedList[]
      try {
        prepared = await loadPrepared(lists)
      } catch (error) {
        logger.warn(error)
        await recall(session.bot, session.channelId, waitId)
        return '拉取出错了，一会儿再试。'
      }
      if (!prepared.length) {
        await recall(session.bot, session.channelId, waitId)
        return '没有可发送的图片。'
      }
      if (options?.random) {
        const image = pickRandomImage(prepared.map(item => item.posts))
        if (!image) {
          await recall(session.bot, session.channelId, waitId)
          return '没有可发送的图片。'
        }
        const error = (await sendPayload(session.bot, () => session.send(h.image(image.data, image.mime)))).error
        if (error && !isAdapterTimeout(error)) {
          await recall(session.bot, session.channelId, waitId)
          return '发送失败了，一会儿再试。OneBot 超时可把适配器 responseTimeout 调大。'
        }
        return
      }
      if (!session.channelId) return '发送失败了，一会儿再试。'
      const error = await sendHotlist(session.bot, prepared, payload => session.send(payload))
      if (error && !isAdapterTimeout(error)) {
        await recall(session.bot, session.channelId, waitId)
        return '发送失败了，一会儿再试。OneBot 超时可把适配器 responseTimeout 调大。'
      }
    })

  const schedule = async () => {
    if (!config.targets.length || !config.lists.length) return
    if (waitTip) await notifyTargets(waitTip)
    try {
      const prepared = await loadPrepared(config.lists)
      if (prepared.length) await sendToTargets(prepared)
    } catch (error) {
      logger.warn(error)
    }
  }

  const tick = async () => {
    await schedule()
    ctx.setTimeout(tick, msUntil(config.hour, 0))
  }

  ctx.setTimeout(tick, msUntil(config.hour, 0))
}
