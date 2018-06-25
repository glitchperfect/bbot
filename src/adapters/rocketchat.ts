import * as bot from '..'
import * as sdk from '@rocket.chat/sdk'

export class Rocketchat extends bot.MessageAdapter {
  name = 'rocketchat-message-adapter'
  constructor (bot: any) {
    super(bot)
    sdk.settings.integrationId = 'bBot'
    bot.logger.info('[rocketchat] using Rocket.Chat as message adapter')
  }

  async start () {
    bot.logger.info(`[rocketchat] Rocket.Chat adapter in use`)

    // Make SDK modules available to scripts, via `adapter.`
    this.driver = sdk.driver
    this.methodCache = sdk.methodCache
    this.api = sdk.api
    this.settings = sdk.settings

    // Print logs with current configs
    bot.logger.info(`[rocketchat] responds to name: ${bot.name}`)
    if (bot.alias) bot.logger.info(`[rocketchat] responds to alias: ${bot.alias}`)

    sdk.driver.useLog(bot.logger)
    await sdk.driver.connect()
    await sdk.driver.login()
    await sdk.driver.subscribeToMessages()
    await sdk.driver.respondToMessages(this.process.bind(this))
    bot.logger.debug(`[rocketchat] connected via DDP`)
  }

  /** Process every incoming message in subscription */
  process (err: Error | null, message: any, meta: any) {
    if (err) throw err
    // Prepare message type for bBot to receive...
    bot.logger.info('[rocketchat] filters passed, will hear message')

    // Collect required attributes from message meta
    const isDM = (meta.roomType === 'd')
    const isLC = (meta.roomType === 'l')
    const user = bot.userById(message.u._id, {
      name: message.u.username,
      alias: message.alias,
      room: {
        id: message.rid,
        type: message.roomType,
        name: meta.roomName
      }
    })

    // Room joins, hear without further detail
    if (message.t === 'uj') {
      bot.logger.debug('[rocketchat] hear type EnterMessage')
      return bot.hear(new bot.EnterMessage(user, message._id))
    }

    // Room exit, hear without further detail
    if (message.t === 'ul') {
      bot.logger.debug('[rocketchat] hear type LeaveMessage')
      return bot.hear(new bot.LeaveMessage(user, message._id))
    }

    // Direct messages prepend bot's name so bBot can respond directly
    const startOfText = (message.msg.indexOf('@') === 0) ? 1 : 0
    const robotIsNamed = message.msg.indexOf(bot.name) === startOfText || message.msg.indexOf(bot.alias) === startOfText
    if ((isDM || isLC) && !robotIsNamed) message.msg = `${bot.name} ${message.msg}`

    // Attachments, format properties as payload for bBot rich message type
    if (Array.isArray(message.attachments) && message.attachments.length) {
      bot.logger.debug('[rocketchat] hear type RichMessage')
      return bot.hear(new bot.RichMessage(user, {
        attachments: message.attachments,
        text: message.text
      }, message._id))
    }

    // Standard text messages, hear as is
    let textMessage = new bot.TextMessage(user, message.msg, message._id)
    bot.logger.debug(`[rocketchat] hear type TextMessage: ${textMessage.toString()}`)
    return bot.hear(textMessage)
  }

  async respond (envelope: bot.Envelope, method: string) {
    switch (method) {
      case 'send':
        if (!envelope.strings) throw new Error('Sending without strings')
        if (!envelope.room.id) throw new Error('Sending without room ID')
        for (let text in envelope.strings) {
          await sdk.driver.sendToRoomId(text, envelope.room.id)
        }
        break
      case 'dm':
        if (!envelope.strings) throw new Error('DM without strings')
        if (!envelope.user) throw new Error('DM without user')
        for (let text in envelope.strings) {
          await sdk.driver.sendDirectToUser(text, envelope.user.username)
        }
        break
      case 'reply':
        if (!envelope.strings) throw new Error('Reply without strings')
        if (!envelope.user) throw new Error('Reply without user')
        if (!envelope.room.id) throw new Error('Reply without room ID')
        if (envelope.room.id.indexOf(envelope.user.id) === -1) {
          envelope.strings = envelope.strings.map((s) => `@${envelope.user!.username} ${s}`)
        }
        for (let text in envelope.strings) {
          await sdk.driver.sendToRoomId(text, envelope.room.id)
        }
        break
      case 'react':
        if (!envelope.strings) throw new Error('React without strings')
        if (!envelope.message) throw new Error('React without message')
        for (let emoji in envelope.strings) {
          if (!emoji.startsWith(':')) emoji = `:${emoji}`
          if (!emoji.endsWith(':')) emoji = `${emoji}:`
          emoji = emoji.replace('-', '_') // Rocket.Chat syntax
          await sdk.driver.setReaction(emoji, envelope.message.id)
        }
        break
      default:
        throw new Error(`Rocket.Chat adapter has no ${method} handler`)
    }
  }

  /** Get a room ID via sdk */
  getRoomId (room: string) {
    return sdk.driver.getRoomId(room)
  }

  /** Call a server message via sdk */
  callMethod (method: string, ...args: any[]) {
    return sdk.driver.callMethod(method, args)
  }
}

export const use = (bot: any) => new Rocketchat(bot)
