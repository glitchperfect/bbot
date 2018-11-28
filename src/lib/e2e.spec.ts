import 'mocha'
import sinon from 'sinon'
import { expect } from 'chai'
import axios from 'axios'
import * as bot from '..'

class MockMessenger extends bot.adapter.Message {
  async dispatch () { return }
  async start () { return }
  async shutdown () { return }
}
const mocks = sinon.createStubInstance(MockMessenger)
mocks.name = 'mock-messenger'

describe('[E2E]', () => {
  beforeEach(async () => {
    await bot.reset()
    bot.adapter.adapters.message = mocks
    await bot.start()
  })
  afterEach(() => {
    mocks.dispatch.resetHistory()
  })
  it('responds from middleware', async () => {
    bot.middleware.register('hear', (b, _, done) => {
      return b.respond('test').then(() => done())
    })
    await bot.thought.receive(bot.message.text(bot.user.create(), ''))
    sinon.assert.calledOnce(mocks.dispatch)
  })
  it('captures input matching conditions', async () => {
    let captured: any[] = []
    bot.global.text({ after: 'call me', before: 'please' }, (b) => {
      captured.push(b.conditions.captured)
    }, { force: true })
    bot.global.text({ after: 'call me' }, (b) => {
      captured.push(b.conditions.captured)
    }, { force: true })
    await bot.thought.receive(bot.message.text(bot.user.create(), 'Call me bb, please'))
    expect(captured).to.eql(['bb', 'bb, please'])
  })
  it('responds with custom attachment attributes', async () => {
    let attachment = {
      'title': 'a custom attachment payload',
      'actions': [{
        'type': 'button',
        'text': 'Visit Google',
        'url': 'http://www.google.com',
        'is_webview': true,
        'webview_height_ratio': 'compact'
      }]
    }
    bot.global.text(/attachment/i, (b) => b.respond(attachment))
    await bot.thought.receive(bot.message.text(bot.user.create(), 'Do attachment'))
    sinon.assert.calledWithMatch(mocks.dispatch, { _payload: {
      attachments: [attachment]
    } })
  })
  it('replies to user from server message', async () => {
    bot.global.server({ test: 1 }, (b) => b.respond('testing'), { id: 'e2e' })
    await axios.get(`${bot.server.url()}/message/111?test=1`)
    sinon.assert.calledWithMatch(mocks.dispatch, { strings: ['testing'] })
  })
})