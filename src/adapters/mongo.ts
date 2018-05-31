import { StorageAdapter } from '..'
import mongoose from 'mongoose'

export interface IStore extends mongoose.Document {
  type: string,
  sub: string,
  data: any
}

/** Provide singleton pattern access to model so it only initialises once */
namespace Model {
  const models: { [key: string]: mongoose.Model<mongoose.Document> } = {}
  export function get (collection: string): mongoose.Model<mongoose.Document> {
    if (!models[collection]) {
      delete mongoose.connection.models[collection] // make sure its gone
      models[collection] = mongoose.model(collection, new mongoose.Schema({
        type: { type: String },
        sub: { type: String, lowercase: true },
        data: { type: mongoose.Schema.Types.Mixed }
      }, { collection }))
    }
    return models[collection]
  }
}

/**
 * Mongo Storage Adapter, keeps bBot brain data collections as sub-collection
 * of a single parent Mongo DB model/collection. The `memory` sub-collection
 * keeps the brain's in-memory data assigned against it's key (e.g. `users`).
 * Long-term data is stored in sub-collections alongside memory, using either
 * a key for key/value pairs, or a key-less array for serial data.
 */
export class Mongo extends StorageAdapter {
  name = 'mongo-storage-adapter'
  config = {
    url: process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/bbot-brain',
    connection: {
      autoIndex: true, // Build indexes
      reconnectTries: Number.MAX_VALUE, // Never stop trying to reconnect
      reconnectInterval: 500, // Reconnect every 500ms
      poolSize: 10, // Maintain up to 10 socket connections
      keepAlive: 120
    },
    collection: process.env.BRAIN_COLLECTION || 'brain'
  }
  model: mongoose.Model<mongoose.Document>
  store?: mongoose.Mongoose

  /** Create adapter instance with ref to bot instance */
  constructor (bot: any) {
    super(bot)
    this.model = Model.get(this.config.collection)
    this.bot.logger.info(`Using Mongo as storage adapter.`)
    this.bot.logger.debug(`Storing to '${this.config.collection}' collection at ${this.config.url}`)
  }

  /** Connect to Mongo */
  async start () {
    this.bot.logger.info(`Connecting to Mongo DB at ${this.config.url}`)
    this.store = await mongoose.connect(this.config.url, this.config.connection)
    return
  }

  /** Disconnect Mongo */
  async shutdown () {
    await mongoose.disconnect()
    return
  }

  /** Put memory data in documents by sub-collection */
  /** @todo compare to copy from last save and only update difference */
  async saveMemory (data: any) {
    this.bot.logger.debug(`Saving memory data to DB`)
    for (let sub in data) {
      const query = { sub, type: 'memory' }
      const doc = { data: data[sub] }
      const options = { upsert: true, lean: true }
      await this.model.findOneAndUpdate(query, doc, options).exec()
    }
    return
  }

  /** Get all the memory document data */
  async loadMemory () {
    this.bot.logger.debug(`Loading memory data from DB`)
    const query = { type: 'memory' }
    const fields = { _id: 0, 'data': 1, 'sub': 1 }
    const opts = { lean: true }
    const docs = await this.model.find(query, fields, opts).exec() as IStore[]
    if (!docs) return undefined
    const memory: any = {}
    for (let doc of docs) {
      if (doc.sub === 'users') {
        if (!memory[doc.sub]) memory[doc.sub] = {}
        for (let id in doc.data) {
          memory[doc.sub][id] = new this.bot.User(doc.data[id])
        }
      } else {
        memory[doc.sub] = doc.data
      }
    }
    return memory
  }

  /** Add item to serial store data */
  /** @todo Add class to model and store constructor ref, to restore on find */
  async keep (sub: string, data: any) {
    this.bot.logger.debug(`Adding a ${sub} value to DB`)
    const query = { sub, type: 'store' }
    const update = { $push: { data } }
    const options = { upsert: true, lean: true }
    await this.model.findOneAndUpdate(query, update, options).exec()
  }

  /** Find certain stuff in Mongo */
  /** @todo Refactor model with data as sub-document so it can be queried */
  /** @todo Add note in docs recommending not to use find on large data sets */
  /** @todo Use class from model to reinitialise with `new bot[constructor]` */
  async find (sub: string, params: any) {
    this.bot.logger.debug(`Finding any ${sub} matching ${params}`)
    const query = { sub, data: { $elemMatch: params }, type: 'store' }
    const fields = { _id: 0, 'data': 1 }
    const opts = { lean: true }
    const doc = await this.model.findOne(query, fields, opts).exec() as IStore
    if (!doc) return undefined
    const matching = doc.data.filter((item: any) => {
      let match = false
      for (let key in params) match = (item[key] === params[key])
      return match
    })
    return matching
  }

  /** Find a thing in Mongo */
  async findOne (sub: string, params: any) {
    this.bot.logger.debug(`Finding a ${sub} matching ${params}`)
    const query = { sub, data: { $elemMatch: params }, type: 'store' }
    const fields = { _id: 0, 'data.$': 1 }
    const opts = { lean: true }
    const doc = await this.model.findOne(query, fields, opts).exec() as IStore
    if (!doc) return undefined
    return doc.data[0]
  }

  /** Get rid of stuff in Mongo */
  async lose (sub: string, params: any) {
    this.bot.logger.debug(`Losing a ${sub} matching ${params}`)
    const query = { sub, type: 'store' }
    const update = { $pull: { data: params } }
    const options = { upsert: true, lean: true }
    await this.model.findOneAndUpdate(query, update, options).exec()
  }
}

export const use = (bot: any) => new Mongo(bot)