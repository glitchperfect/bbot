import { MessageAdapter } from '..'

export class Shell extends MessageAdapter {
  name = 'shell-message-adapter'
  constructor (bot: any) {
    super(bot)
    this.bot.logger.info('Using Shell as message adapter')
  }
}

export const use = (bot: any) => new Shell(bot)