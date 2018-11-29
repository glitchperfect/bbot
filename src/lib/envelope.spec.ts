import 'mocha'
import * as sinon from 'sinon'
import { expect } from 'chai'
import * as bot from '.'

const testRoom = {
  id: '111',
  name: 'testing'
}
const testRoomDM = bot.room.byId('222', { name: 'tester-direct ' })
const testUser = bot.user.create({ name: 'tester', room: testRoomDM })

describe('[envelope]', () => {
  describe('Envelope', () => {
    it('defaults provide method, id, room and user', () => {
      const envelope = bot.envelope.create()
      expect(envelope).to.include.keys(['id', 'method', 'room', 'user'])
      expect(envelope.method).to.equal('send')
      expect(envelope.id).to.have.lengthOf(32)
    })
    it('given user room and room, addresses to the room', () => {
      const envelope = bot.envelope.create({ user: testUser, room: testRoom })
      expect(envelope.room).to.eql(testRoom)
    })
    it('given just user, addresses to the user\'s room', () => {
      const envelope = bot.envelope.create({ user: testUser })
      expect(envelope.room).to.eql(testRoomDM)
    })
    it('given just room, user is blank', () => {
      const envelope = bot.envelope.create({ room: testRoom })
      expect(envelope.user).to.eql(bot.user.blank())
    })
    it('given content, keeps those properties', () => {
      const envelope = bot.envelope.create({
        strings: ['waves hello'],
        payload: { attachments: [{ fallback: 'I am an attachment' }] },
        method: 'emote'
      })
      expect(envelope).to.deep.include({
        strings: ['waves hello'],
        payload: { attachments: [{ fallback: 'I am an attachment' }] },
        method: 'emote'
      })
    })
  })
  describe('.toRoomId', () => {
    it('sets room id, getting name from known room', () => {
      const envelope = bot.envelope.create({ room: testRoom })
      envelope.toRoomId(testRoomDM.id)
      expect(envelope.room).to.eql(testRoomDM)
    })
  })
  describe('.toUser', () => {
    it('sets room of user', () => {
      const envelope = bot.envelope.create({ room: testRoom })
      envelope.toUser(testUser)
      expect(envelope.room).to.eql(testUser.room)
    })
  })
  describe('.write', () => {
    it('adds strings to envelope', () => {
      const envelope = bot.envelope.create().write('Test 1', 'Test 2')
      expect(envelope.strings).to.eql(['Test 1', 'Test 2'])
    })
    it('concatenates existing strings with cumulative calls', () => {
      const envelope = bot.envelope.create()
      envelope.write('Test 1', 'Test 2')
      envelope.write('Test 3')
      expect(envelope.strings).to.eql(['Test 1', 'Test 2', 'Test 3'])
    })
  })
  describe('.attach', () => {
    it('adds attachment to envelope payload', () => {
      const envelope = bot.envelope.create().attach({ fallback: 'foo' })
      expect(envelope.payload.toObject()).to.eql({
        attachments: [{ fallback: 'foo' }]
      })
    })
    it('can build payload with cumulative calls', () => {
      const envelope = bot.envelope.create()
      envelope.attach({ fallback: 'bar' })
      envelope.attach({ fallback: 'qux' })
      expect(envelope.payload.toObject()).to.eql({
        attachments: [{ fallback: 'bar' }, { fallback: 'qux' }]
      })
    })
  })
  describe('.compose', () => {
    it('passes strings to write and objects to attach', () => {
      const envelope = bot.envelope.create()
      const write = sinon.spy(envelope, 'write')
      const attach = sinon.spy(envelope, 'attach')
      envelope.compose('hello', { fallback: 'foo' }, 'world')
      expect(write.args).to.eql([['hello'], ['world']])
      expect(attach.args).to.eql([[{ fallback: 'foo' }]])
      write.restore()
      attach.restore()
    })
  })
  describe('.via', () => {
    it('overwrites default method', () => {
      const envelope = bot.envelope.create()
      envelope.via('emote')
      expect(envelope.method).to.equal('emote')
    })
  })
})
