import { Context, Element, Schema, h } from 'koishi'
import {
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
  targets: Target[]
}

export const Config: Schema<Config> = Schema.object({
  lists: Schema.array(ListKindSchema).role('select').default(['daily']).description('定时推送的榜单。多个榜打进同一条合并转发，只发图。'),
  hour: Schema.number().min(0).max(23).default(22).description('推送小时（服务器本地时区）。'),
  minute: Schema.number().min(0).max(59).default(0).description('推送分钟。'),
  skipGif: Schema.boolean().default(false).description('跳过 GIF（后缀 .gif 或文件头 GIF8）。'),
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

const USAGE = '用法：jandan <榜单名...> [-r]\n榜单：无聊图 / 随手拍 / 4小时 / 3日 / 7日（也可用 daily / ooxx / 4hr / 3d / 7d）'

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('jandan')

  async function sendToTargets(content: Element) {
    for (const target of config.targets) {
      const bot = ctx.bots.find(item => item.platform === target.platform && item.selfId === target.selfId)
      if (!bot) {
        logger.warn('no bot for %s:%s', target.platform, target.selfId)
        continue
      }
      try {
        await bot.sendMessage(target.channelId, content, target.guildId)
      } catch (error) {
        logger.warn(error)
      }
    }
  }

  async function buildMessage(kinds: ListKind[], random: boolean) {
    const prepared = await buildPayload(ctx.http, kinds, config.skipGif)
    if (!prepared.length) return null
    if (random) {
      const image = pickRandomImage(prepared.map(item => item.posts))
      if (!image) return null
      return h.image(image.url)
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
      let payload: Element | null
      try {
        payload = await buildMessage(lists, !!options?.random)
      } catch (error) {
        logger.warn(error)
        return '拉取出错了，一会儿再试。'
      }
      if (!payload) return '没有可发送的图片。'
      try {
        await session.send(payload)
      } catch (error) {
        logger.warn(error)
        return '发送失败了，一会儿再试。OneBot 超时可把适配器 responseTimeout 调大，或打开 skipGif。'
      }
    })

  const schedule = async () => {
    if (!config.targets.length || !config.lists.length) return
    try {
      const payload = await buildMessage(config.lists, false)
      if (payload) await sendToTargets(payload)
    } catch (error) {
      logger.warn(error)
    }
  }

  const tick = async () => {
    await schedule()
    ctx.setTimeout(tick, msUntil(config.hour, config.minute))
  }

  ctx.setTimeout(tick, msUntil(config.hour, config.minute))
}
