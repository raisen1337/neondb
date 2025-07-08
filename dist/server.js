/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 459:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        const nodeCrypto = __webpack_require__(6982)

        module.exports = {
          postgresMd5PasswordHash,
          randomBytes,
          deriveKey,
          sha256,
          hashByName,
          hmacSha256,
          md5,
        }

        /**
         * The Web Crypto API - grabbed from the Node.js library or the global
         * @type Crypto
         */
        // eslint-disable-next-line no-undef
        const webCrypto = nodeCrypto.webcrypto || globalThis.crypto
        /**
         * The SubtleCrypto API for low level crypto operations.
         * @type SubtleCrypto
         */
        const subtleCrypto = webCrypto.subtle
        const textEncoder = new TextEncoder()

        /**
         *
         * @param {*} length
         * @returns
         */
        function randomBytes(length) {
          return webCrypto.getRandomValues(Buffer.alloc(length))
        }

        async function md5(string) {
          try {
            return nodeCrypto.createHash('md5').update(string, 'utf-8').digest('hex')
          } catch (e) {
            // `createHash()` failed so we are probably not in Node.js, use the WebCrypto API instead.
            // Note that the MD5 algorithm on WebCrypto is not available in Node.js.
            // This is why we cannot just use WebCrypto in all environments.
            const data = typeof string === 'string' ? textEncoder.encode(string) : string
            const hash = await subtleCrypto.digest('MD5', data)
            return Array.from(new Uint8Array(hash))
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('')
          }
        }

        // See AuthenticationMD5Password at https://www.postgresql.org/docs/current/static/protocol-flow.html
        async function postgresMd5PasswordHash(user, password, salt) {
          const inner = await md5(password + user)
          const outer = await md5(Buffer.concat([Buffer.from(inner), salt]))
          return 'md5' + outer
        }

        /**
         * Create a SHA-256 digest of the given data
         * @param {Buffer} data
         */
        async function sha256(text) {
          return await subtleCrypto.digest('SHA-256', text)
        }

        async function hashByName(hashName, text) {
          return await subtleCrypto.digest(hashName, text)
        }

        /**
         * Sign the message with the given key
         * @param {ArrayBuffer} keyBuffer
         * @param {string} msg
         */
        async function hmacSha256(keyBuffer, msg) {
          const key = await subtleCrypto.importKey('raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
          return await subtleCrypto.sign('HMAC', key, textEncoder.encode(msg))
        }

        /**
         * Derive a key from the password and salt
         * @param {string} password
         * @param {Uint8Array} salt
         * @param {number} iterations
         */
        async function deriveKey(password, salt, iterations) {
          const key = await subtleCrypto.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveBits'])
          const params = { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations }
          return await subtleCrypto.deriveBits(params, key, 32 * 8, ['deriveBits'])
        }


        /***/
}),

/***/ 946:
/***/ ((__unused_webpack_module, exports) => {

        "use strict";

        //binary data writer tuned for encoding binary specific to the postgres binary protocol
        Object.defineProperty(exports, "__esModule", ({ value: true }));
        exports.Writer = void 0;
        class Writer {
          constructor(size = 256) {
            this.size = size;
            this.offset = 5;
            this.headerPosition = 0;
            this.buffer = Buffer.allocUnsafe(size);
          }
          ensure(size) {
            const remaining = this.buffer.length - this.offset;
            if (remaining < size) {
              const oldBuffer = this.buffer;
              // exponential growth factor of around ~ 1.5
              // https://stackoverflow.com/questions/2269063/buffer-growth-strategy
              const newSize = oldBuffer.length + (oldBuffer.length >> 1) + size;
              this.buffer = Buffer.allocUnsafe(newSize);
              oldBuffer.copy(this.buffer);
            }
          }
          addInt32(num) {
            this.ensure(4);
            this.buffer[this.offset++] = (num >>> 24) & 0xff;
            this.buffer[this.offset++] = (num >>> 16) & 0xff;
            this.buffer[this.offset++] = (num >>> 8) & 0xff;
            this.buffer[this.offset++] = (num >>> 0) & 0xff;
            return this;
          }
          addInt16(num) {
            this.ensure(2);
            this.buffer[this.offset++] = (num >>> 8) & 0xff;
            this.buffer[this.offset++] = (num >>> 0) & 0xff;
            return this;
          }
          addCString(string) {
            if (!string) {
              this.ensure(1);
            }
            else {
              const len = Buffer.byteLength(string);
              this.ensure(len + 1); // +1 for null terminator
              this.buffer.write(string, this.offset, 'utf-8');
              this.offset += len;
            }
            this.buffer[this.offset++] = 0; // null terminator
            return this;
          }
          addString(string = '') {
            const len = Buffer.byteLength(string);
            this.ensure(len);
            this.buffer.write(string, this.offset);
            this.offset += len;
            return this;
          }
          add(otherBuffer) {
            this.ensure(otherBuffer.length);
            otherBuffer.copy(this.buffer, this.offset);
            this.offset += otherBuffer.length;
            return this;
          }
          join(code) {
            if (code) {
              this.buffer[this.headerPosition] = code;
              //length is everything in this packet minus the code
              const length = this.offset - (this.headerPosition + 1);
              this.buffer.writeInt32BE(length, this.headerPosition + 1);
            }
            return this.buffer.slice(code ? 0 : 5, this.offset);
          }
          flush(code) {
            const result = this.join(code);
            this.offset = 5;
            this.headerPosition = 0;
            this.buffer = Buffer.allocUnsafe(this.size);
            return result;
          }
        }
        exports.Writer = Writer;
        //# sourceMappingURL=buffer-writer.js.map

        /***/
}),

/***/ 1010:
/***/ ((module) => {

        /**
         * Following query was used to generate this file:
        
         SELECT json_object_agg(UPPER(PT.typname), PT.oid::int4 ORDER BY pt.oid)
         FROM pg_type PT
         WHERE typnamespace = (SELECT pgn.oid FROM pg_namespace pgn WHERE nspname = 'pg_catalog') -- Take only builting Postgres types with stable OID (extension types are not guaranted to be stable)
         AND typtype = 'b' -- Only basic types
         AND typelem = 0 -- Ignore aliases
         AND typisdefined -- Ignore undefined types
         */

        module.exports = {
          BOOL: 16,
          BYTEA: 17,
          CHAR: 18,
          INT8: 20,
          INT2: 21,
          INT4: 23,
          REGPROC: 24,
          TEXT: 25,
          OID: 26,
          TID: 27,
          XID: 28,
          CID: 29,
          JSON: 114,
          XML: 142,
          PG_NODE_TREE: 194,
          SMGR: 210,
          PATH: 602,
          POLYGON: 604,
          CIDR: 650,
          FLOAT4: 700,
          FLOAT8: 701,
          ABSTIME: 702,
          RELTIME: 703,
          TINTERVAL: 704,
          CIRCLE: 718,
          MACADDR8: 774,
          MONEY: 790,
          MACADDR: 829,
          INET: 869,
          ACLITEM: 1033,
          BPCHAR: 1042,
          VARCHAR: 1043,
          DATE: 1082,
          TIME: 1083,
          TIMESTAMP: 1114,
          TIMESTAMPTZ: 1184,
          INTERVAL: 1186,
          TIMETZ: 1266,
          BIT: 1560,
          VARBIT: 1562,
          NUMERIC: 1700,
          REFCURSOR: 1790,
          REGPROCEDURE: 2202,
          REGOPER: 2203,
          REGOPERATOR: 2204,
          REGCLASS: 2205,
          REGTYPE: 2206,
          UUID: 2950,
          TXID_SNAPSHOT: 2970,
          PG_LSN: 3220,
          PG_NDISTINCT: 3361,
          PG_DEPENDENCIES: 3402,
          TSVECTOR: 3614,
          TSQUERY: 3615,
          GTSVECTOR: 3642,
          REGCONFIG: 3734,
          REGDICTIONARY: 3769,
          JSONB: 3802,
          REGNAMESPACE: 4089,
          REGROLE: 4096
        };


        /***/
}),

/***/ 1293:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";

        const EventEmitter = (__webpack_require__(4434).EventEmitter)

        const NOOP = function () { }

        const removeWhere = (list, predicate) => {
          const i = list.findIndex(predicate)

          return i === -1 ? undefined : list.splice(i, 1)[0]
        }

        class IdleItem {
          constructor(client, idleListener, timeoutId) {
            this.client = client
            this.idleListener = idleListener
            this.timeoutId = timeoutId
          }
        }

        class PendingItem {
          constructor(callback) {
            this.callback = callback
          }
        }

        function throwOnDoubleRelease() {
          throw new Error('Release called on client which has already been released to the pool.')
        }

        function promisify(Promise, callback) {
          if (callback) {
            return { callback: callback, result: undefined }
          }
          let rej
          let res
          const cb = function (err, client) {
            err ? rej(err) : res(client)
          }
          const result = new Promise(function (resolve, reject) {
            res = resolve
            rej = reject
          }).catch((err) => {
            // replace the stack trace that leads to `TCP.onStreamRead` with one that leads back to the
            // application that created the query
            Error.captureStackTrace(err)
            throw err
          })
          return { callback: cb, result: result }
        }

        function makeIdleListener(pool, client) {
          return function idleListener(err) {
            err.client = client

            client.removeListener('error', idleListener)
            client.on('error', () => {
              pool.log('additional client error after disconnection due to error', err)
            })
            pool._remove(client)
            // TODO - document that once the pool emits an error
            // the client has already been closed & purged and is unusable
            pool.emit('error', err, client)
          }
        }

        class Pool extends EventEmitter {
          constructor(options, Client) {
            super()
            this.options = Object.assign({}, options)

            if (options != null && 'password' in options) {
              // "hiding" the password so it doesn't show up in stack traces
              // or if the client is console.logged
              Object.defineProperty(this.options, 'password', {
                configurable: true,
                enumerable: false,
                writable: true,
                value: options.password,
              })
            }
            if (options != null && options.ssl && options.ssl.key) {
              // "hiding" the ssl->key so it doesn't show up in stack traces
              // or if the client is console.logged
              Object.defineProperty(this.options.ssl, 'key', {
                enumerable: false,
              })
            }

            this.options.max = this.options.max || this.options.poolSize || 10
            this.options.min = this.options.min || 0
            this.options.maxUses = this.options.maxUses || Infinity
            this.options.allowExitOnIdle = this.options.allowExitOnIdle || false
            this.options.maxLifetimeSeconds = this.options.maxLifetimeSeconds || 0
            this.log = this.options.log || function () { }
            this.Client = this.options.Client || Client || (__webpack_require__(1596).Client)
            this.Promise = this.options.Promise || global.Promise

            if (typeof this.options.idleTimeoutMillis === 'undefined') {
              this.options.idleTimeoutMillis = 10000
            }

            this._clients = []
            this._idle = []
            this._expired = new WeakSet()
            this._pendingQueue = []
            this._endCallback = undefined
            this.ending = false
            this.ended = false
          }

          _isFull() {
            return this._clients.length >= this.options.max
          }

          _isAboveMin() {
            return this._clients.length > this.options.min
          }

          _pulseQueue() {
            this.log('pulse queue')
            if (this.ended) {
              this.log('pulse queue ended')
              return
            }
            if (this.ending) {
              this.log('pulse queue on ending')
              if (this._idle.length) {
                this._idle.slice().map((item) => {
                  this._remove(item.client)
                })
              }
              if (!this._clients.length) {
                this.ended = true
                this._endCallback()
              }
              return
            }

            // if we don't have any waiting, do nothing
            if (!this._pendingQueue.length) {
              this.log('no queued requests')
              return
            }
            // if we don't have any idle clients and we have no more room do nothing
            if (!this._idle.length && this._isFull()) {
              return
            }
            const pendingItem = this._pendingQueue.shift()
            if (this._idle.length) {
              const idleItem = this._idle.pop()
              clearTimeout(idleItem.timeoutId)
              const client = idleItem.client
              client.ref && client.ref()
              const idleListener = idleItem.idleListener

              return this._acquireClient(client, pendingItem, idleListener, false)
            }
            if (!this._isFull()) {
              return this.newClient(pendingItem)
            }
            throw new Error('unexpected condition')
          }

          _remove(client, callback) {
            const removed = removeWhere(this._idle, (item) => item.client === client)

            if (removed !== undefined) {
              clearTimeout(removed.timeoutId)
            }

            this._clients = this._clients.filter((c) => c !== client)
            const context = this
            client.end(() => {
              context.emit('remove', client)

              if (typeof callback === 'function') {
                callback()
              }
            })
          }

          connect(cb) {
            if (this.ending) {
              const err = new Error('Cannot use a pool after calling end on the pool')
              return cb ? cb(err) : this.Promise.reject(err)
            }

            const response = promisify(this.Promise, cb)
            const result = response.result

            // if we don't have to connect a new client, don't do so
            if (this._isFull() || this._idle.length) {
              // if we have idle clients schedule a pulse immediately
              if (this._idle.length) {
                process.nextTick(() => this._pulseQueue())
              }

              if (!this.options.connectionTimeoutMillis) {
                this._pendingQueue.push(new PendingItem(response.callback))
                return result
              }

              const queueCallback = (err, res, done) => {
                clearTimeout(tid)
                response.callback(err, res, done)
              }

              const pendingItem = new PendingItem(queueCallback)

              // set connection timeout on checking out an existing client
              const tid = setTimeout(() => {
                // remove the callback from pending waiters because
                // we're going to call it with a timeout error
                removeWhere(this._pendingQueue, (i) => i.callback === queueCallback)
                pendingItem.timedOut = true
                response.callback(new Error('timeout exceeded when trying to connect'))
              }, this.options.connectionTimeoutMillis)

              if (tid.unref) {
                tid.unref()
              }

              this._pendingQueue.push(pendingItem)
              return result
            }

            this.newClient(new PendingItem(response.callback))

            return result
          }

          newClient(pendingItem) {
            const client = new this.Client(this.options)
            this._clients.push(client)
            const idleListener = makeIdleListener(this, client)

            this.log('checking client timeout')

            // connection timeout logic
            let tid
            let timeoutHit = false
            if (this.options.connectionTimeoutMillis) {
              tid = setTimeout(() => {
                this.log('ending client due to timeout')
                timeoutHit = true
                // force kill the node driver, and let libpq do its teardown
                client.connection ? client.connection.stream.destroy() : client.end()
              }, this.options.connectionTimeoutMillis)
            }

            this.log('connecting new client')
            client.connect((err) => {
              if (tid) {
                clearTimeout(tid)
              }
              client.on('error', idleListener)
              if (err) {
                this.log('client failed to connect', err)
                // remove the dead client from our list of clients
                this._clients = this._clients.filter((c) => c !== client)
                if (timeoutHit) {
                  err = new Error('Connection terminated due to connection timeout', { cause: err })
                }

                // this client won’t be released, so move on immediately
                this._pulseQueue()

                if (!pendingItem.timedOut) {
                  pendingItem.callback(err, undefined, NOOP)
                }
              } else {
                this.log('new client connected')

                if (this.options.maxLifetimeSeconds !== 0) {
                  const maxLifetimeTimeout = setTimeout(() => {
                    this.log('ending client due to expired lifetime')
                    this._expired.add(client)
                    const idleIndex = this._idle.findIndex((idleItem) => idleItem.client === client)
                    if (idleIndex !== -1) {
                      this._acquireClient(
                        client,
                        new PendingItem((err, client, clientRelease) => clientRelease()),
                        idleListener,
                        false
                      )
                    }
                  }, this.options.maxLifetimeSeconds * 1000)

                  maxLifetimeTimeout.unref()
                  client.once('end', () => clearTimeout(maxLifetimeTimeout))
                }

                return this._acquireClient(client, pendingItem, idleListener, true)
              }
            })
          }

          // acquire a client for a pending work item
          _acquireClient(client, pendingItem, idleListener, isNew) {
            if (isNew) {
              this.emit('connect', client)
            }

            this.emit('acquire', client)

            client.release = this._releaseOnce(client, idleListener)

            client.removeListener('error', idleListener)

            if (!pendingItem.timedOut) {
              if (isNew && this.options.verify) {
                this.options.verify(client, (err) => {
                  if (err) {
                    client.release(err)
                    return pendingItem.callback(err, undefined, NOOP)
                  }

                  pendingItem.callback(undefined, client, client.release)
                })
              } else {
                pendingItem.callback(undefined, client, client.release)
              }
            } else {
              if (isNew && this.options.verify) {
                this.options.verify(client, client.release)
              } else {
                client.release()
              }
            }
          }

          // returns a function that wraps _release and throws if called more than once
          _releaseOnce(client, idleListener) {
            let released = false

            return (err) => {
              if (released) {
                throwOnDoubleRelease()
              }

              released = true
              this._release(client, idleListener, err)
            }
          }

          // release a client back to the poll, include an error
          // to remove it from the pool
          _release(client, idleListener, err) {
            client.on('error', idleListener)

            client._poolUseCount = (client._poolUseCount || 0) + 1

            this.emit('release', err, client)

            // TODO(bmc): expose a proper, public interface _queryable and _ending
            if (err || this.ending || !client._queryable || client._ending || client._poolUseCount >= this.options.maxUses) {
              if (client._poolUseCount >= this.options.maxUses) {
                this.log('remove expended client')
              }

              return this._remove(client, this._pulseQueue.bind(this))
            }

            const isExpired = this._expired.has(client)
            if (isExpired) {
              this.log('remove expired client')
              this._expired.delete(client)
              return this._remove(client, this._pulseQueue.bind(this))
            }

            // idle timeout
            let tid
            if (this.options.idleTimeoutMillis && this._isAboveMin()) {
              tid = setTimeout(() => {
                this.log('remove idle client')
                this._remove(client, this._pulseQueue.bind(this))
              }, this.options.idleTimeoutMillis)

              if (this.options.allowExitOnIdle) {
                // allow Node to exit if this is all that's left
                tid.unref()
              }
            }

            if (this.options.allowExitOnIdle) {
              client.unref()
            }

            this._idle.push(new IdleItem(client, idleListener, tid))
            this._pulseQueue()
          }

          query(text, values, cb) {
            // guard clause against passing a function as the first parameter
            if (typeof text === 'function') {
              const response = promisify(this.Promise, text)
              setImmediate(function () {
                return response.callback(new Error('Passing a function as the first parameter to pool.query is not supported'))
              })
              return response.result
            }

            // allow plain text query without values
            if (typeof values === 'function') {
              cb = values
              values = undefined
            }
            const response = promisify(this.Promise, cb)
            cb = response.callback

            this.connect((err, client) => {
              if (err) {
                return cb(err)
              }

              let clientReleased = false
              const onError = (err) => {
                if (clientReleased) {
                  return
                }
                clientReleased = true
                client.release(err)
                cb(err)
              }

              client.once('error', onError)
              this.log('dispatching query')
              try {
                client.query(text, values, (err, res) => {
                  this.log('query dispatched')
                  client.removeListener('error', onError)
                  if (clientReleased) {
                    return
                  }
                  clientReleased = true
                  client.release(err)
                  if (err) {
                    return cb(err)
                  }
                  return cb(undefined, res)
                })
              } catch (err) {
                client.release(err)
                return cb(err)
              }
            })
            return response.result
          }

          end(cb) {
            this.log('ending')
            if (this.ending) {
              const err = new Error('Called end on pool more than once')
              return cb ? cb(err) : this.Promise.reject(err)
            }
            this.ending = true
            const promised = promisify(this.Promise, cb)
            this._endCallback = promised.callback
            this._pulseQueue()
            return promised.result
          }

          get waitingCount() {
            return this._pendingQueue.length
          }

          get idleCount() {
            return this._idle.length
          }

          get expiredCount() {
            return this._clients.reduce((acc, client) => acc + (this._expired.has(client) ? 1 : 0), 0)
          }

          get totalCount() {
            return this._clients.length
          }
        }
        module.exports = Pool


        /***/
}),

/***/ 1596:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        const Client = __webpack_require__(7077)
        const defaults = __webpack_require__(6864)
        const Connection = __webpack_require__(8046)
        const Result = __webpack_require__(4295)
        const utils = __webpack_require__(2341)
        const Pool = __webpack_require__(1293)
        const TypeOverrides = __webpack_require__(8686)
        const { DatabaseError } = __webpack_require__(5252)
        const { escapeIdentifier, escapeLiteral } = __webpack_require__(2341)

        const poolFactory = (Client) => {
          return class BoundPool extends Pool {
            constructor(options) {
              super(options, Client)
            }
          }
        }

        const PG = function (clientConstructor) {
          this.defaults = defaults
          this.Client = clientConstructor
          this.Query = this.Client.Query
          this.Pool = poolFactory(this.Client)
          this._pools = []
          this.Connection = Connection
          this.types = __webpack_require__(3988)
          this.DatabaseError = DatabaseError
          this.TypeOverrides = TypeOverrides
          this.escapeIdentifier = escapeIdentifier
          this.escapeLiteral = escapeLiteral
          this.Result = Result
          this.utils = utils
        }

        if (typeof process.env.NODE_PG_FORCE_NATIVE !== 'undefined') {
          module.exports = new PG(__webpack_require__(8082))
        } else {
          module.exports = new PG(Client)

          // lazy require native module...the native module may not have installed
          Object.defineProperty(module.exports, "native", ({
            configurable: true,
            enumerable: false,
            get() {
              let native = null
              try {
                native = new PG(__webpack_require__(8082))
              } catch (err) {
                if (err.code !== 'MODULE_NOT_FOUND') {
                  throw err
                }
              }

              // overwrite module.exports.native so that getter is never called again
              Object.defineProperty(module.exports, "native", ({
                value: native,
              }))

              return native
            },
          }))
        }


        /***/
}),

/***/ 2203:
/***/ ((module) => {

        "use strict";
        module.exports = require("stream");

        /***/
}),

/***/ 2250:
/***/ ((module) => {

        "use strict";
        module.exports = require("dns");

        /***/
}),

/***/ 2341:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        const defaults = __webpack_require__(6864)

        const util = __webpack_require__(9023)
        const { isDate } = util.types || util // Node 8 doesn't have `util.types`

        function escapeElement(elementRepresentation) {
          const escaped = elementRepresentation.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

          return '"' + escaped + '"'
        }

        // convert a JS array to a postgres array literal
        // uses comma separator so won't work for types like box that use
        // a different array separator.
        function arrayString(val) {
          let result = '{'
          for (let i = 0; i < val.length; i++) {
            if (i > 0) {
              result = result + ','
            }
            if (val[i] === null || typeof val[i] === 'undefined') {
              result = result + 'NULL'
            } else if (Array.isArray(val[i])) {
              result = result + arrayString(val[i])
            } else if (ArrayBuffer.isView(val[i])) {
              let item = val[i]
              if (!(item instanceof Buffer)) {
                const buf = Buffer.from(item.buffer, item.byteOffset, item.byteLength)
                if (buf.length === item.byteLength) {
                  item = buf
                } else {
                  item = buf.slice(item.byteOffset, item.byteOffset + item.byteLength)
                }
              }
              result += '\\\\x' + item.toString('hex')
            } else {
              result += escapeElement(prepareValue(val[i]))
            }
          }
          result = result + '}'
          return result
        }

        // converts values from javascript types
        // to their 'raw' counterparts for use as a postgres parameter
        // note: you can override this function to provide your own conversion mechanism
        // for complex types, etc...
        const prepareValue = function (val, seen) {
          // null and undefined are both null for postgres
          if (val == null) {
            return null
          }
          if (typeof val === 'object') {
            if (val instanceof Buffer) {
              return val
            }
            if (ArrayBuffer.isView(val)) {
              const buf = Buffer.from(val.buffer, val.byteOffset, val.byteLength)
              if (buf.length === val.byteLength) {
                return buf
              }
              return buf.slice(val.byteOffset, val.byteOffset + val.byteLength) // Node.js v4 does not support those Buffer.from params
            }
            if (isDate(val)) {
              if (defaults.parseInputDatesAsUTC) {
                return dateToStringUTC(val)
              } else {
                return dateToString(val)
              }
            }
            if (Array.isArray(val)) {
              return arrayString(val)
            }

            return prepareObject(val, seen)
          }
          return val.toString()
        }

        function prepareObject(val, seen) {
          if (val && typeof val.toPostgres === 'function') {
            seen = seen || []
            if (seen.indexOf(val) !== -1) {
              throw new Error('circular reference detected while preparing "' + val + '" for query')
            }
            seen.push(val)

            return prepareValue(val.toPostgres(prepareValue), seen)
          }
          return JSON.stringify(val)
        }

        function dateToString(date) {
          let offset = -date.getTimezoneOffset()

          let year = date.getFullYear()
          const isBCYear = year < 1
          if (isBCYear) year = Math.abs(year) + 1 // negative years are 1 off their BC representation

          let ret =
            String(year).padStart(4, '0') +
            '-' +
            String(date.getMonth() + 1).padStart(2, '0') +
            '-' +
            String(date.getDate()).padStart(2, '0') +
            'T' +
            String(date.getHours()).padStart(2, '0') +
            ':' +
            String(date.getMinutes()).padStart(2, '0') +
            ':' +
            String(date.getSeconds()).padStart(2, '0') +
            '.' +
            String(date.getMilliseconds()).padStart(3, '0')

          if (offset < 0) {
            ret += '-'
            offset *= -1
          } else {
            ret += '+'
          }

          ret += String(Math.floor(offset / 60)).padStart(2, '0') + ':' + String(offset % 60).padStart(2, '0')
          if (isBCYear) ret += ' BC'
          return ret
        }

        function dateToStringUTC(date) {
          let year = date.getUTCFullYear()
          const isBCYear = year < 1
          if (isBCYear) year = Math.abs(year) + 1 // negative years are 1 off their BC representation

          let ret =
            String(year).padStart(4, '0') +
            '-' +
            String(date.getUTCMonth() + 1).padStart(2, '0') +
            '-' +
            String(date.getUTCDate()).padStart(2, '0') +
            'T' +
            String(date.getUTCHours()).padStart(2, '0') +
            ':' +
            String(date.getUTCMinutes()).padStart(2, '0') +
            ':' +
            String(date.getUTCSeconds()).padStart(2, '0') +
            '.' +
            String(date.getUTCMilliseconds()).padStart(3, '0')

          ret += '+00:00'
          if (isBCYear) ret += ' BC'
          return ret
        }

        function normalizeQueryConfig(config, values, callback) {
          // can take in strings or config objects
          config = typeof config === 'string' ? { text: config } : config
          if (values) {
            if (typeof values === 'function') {
              config.callback = values
            } else {
              config.values = values
            }
          }
          if (callback) {
            config.callback = callback
          }
          return config
        }

        // Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
        const escapeIdentifier = function (str) {
          return '"' + str.replace(/"/g, '""') + '"'
        }

        const escapeLiteral = function (str) {
          let hasBackslash = false
          let escaped = "'"

          if (str == null) {
            return "''"
          }

          if (typeof str !== 'string') {
            return "''"
          }

          for (let i = 0; i < str.length; i++) {
            const c = str[i]
            if (c === "'") {
              escaped += c + c
            } else if (c === '\\') {
              escaped += c + c
              hasBackslash = true
            } else {
              escaped += c
            }
          }

          escaped += "'"

          if (hasBackslash === true) {
            escaped = ' E' + escaped
          }

          return escaped
        }

        module.exports = {
          prepareValue: function prepareValueWrapper(value) {
            // this ensures that extra arguments do not get passed into prepareValue
            // by accident, eg: from calling values.map(utils.prepareValue)
            return prepareValue(value)
          },
          normalizeQueryConfig,
          escapeIdentifier,
          escapeLiteral,
        }


        /***/
}),

/***/ 2625:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

        "use strict";

        Object.defineProperty(exports, "__esModule", ({ value: true }));
        exports.Parser = void 0;
        const messages_1 = __webpack_require__(4618);
        const buffer_reader_1 = __webpack_require__(5026);
        // every message is prefixed with a single bye
        const CODE_LENGTH = 1;
        // every message has an int32 length which includes itself but does
        // NOT include the code in the length
        const LEN_LENGTH = 4;
        const HEADER_LENGTH = CODE_LENGTH + LEN_LENGTH;
        const emptyBuffer = Buffer.allocUnsafe(0);
        class Parser {
          constructor(opts) {
            this.buffer = emptyBuffer;
            this.bufferLength = 0;
            this.bufferOffset = 0;
            this.reader = new buffer_reader_1.BufferReader();
            if ((opts === null || opts === void 0 ? void 0 : opts.mode) === 'binary') {
              throw new Error('Binary mode not supported yet');
            }
            this.mode = (opts === null || opts === void 0 ? void 0 : opts.mode) || 'text';
          }
          parse(buffer, callback) {
            this.mergeBuffer(buffer);
            const bufferFullLength = this.bufferOffset + this.bufferLength;
            let offset = this.bufferOffset;
            while (offset + HEADER_LENGTH <= bufferFullLength) {
              // code is 1 byte long - it identifies the message type
              const code = this.buffer[offset];
              // length is 1 Uint32BE - it is the length of the message EXCLUDING the code
              const length = this.buffer.readUInt32BE(offset + CODE_LENGTH);
              const fullMessageLength = CODE_LENGTH + length;
              if (fullMessageLength + offset <= bufferFullLength) {
                const message = this.handlePacket(offset + HEADER_LENGTH, code, length, this.buffer);
                callback(message);
                offset += fullMessageLength;
              }
              else {
                break;
              }
            }
            if (offset === bufferFullLength) {
              // No more use for the buffer
              this.buffer = emptyBuffer;
              this.bufferLength = 0;
              this.bufferOffset = 0;
            }
            else {
              // Adjust the cursors of remainingBuffer
              this.bufferLength = bufferFullLength - offset;
              this.bufferOffset = offset;
            }
          }
          mergeBuffer(buffer) {
            if (this.bufferLength > 0) {
              const newLength = this.bufferLength + buffer.byteLength;
              const newFullLength = newLength + this.bufferOffset;
              if (newFullLength > this.buffer.byteLength) {
                // We can't concat the new buffer with the remaining one
                let newBuffer;
                if (newLength <= this.buffer.byteLength && this.bufferOffset >= this.bufferLength) {
                  // We can move the relevant part to the beginning of the buffer instead of allocating a new buffer
                  newBuffer = this.buffer;
                }
                else {
                  // Allocate a new larger buffer
                  let newBufferLength = this.buffer.byteLength * 2;
                  while (newLength >= newBufferLength) {
                    newBufferLength *= 2;
                  }
                  newBuffer = Buffer.allocUnsafe(newBufferLength);
                }
                // Move the remaining buffer to the new one
                this.buffer.copy(newBuffer, 0, this.bufferOffset, this.bufferOffset + this.bufferLength);
                this.buffer = newBuffer;
                this.bufferOffset = 0;
              }
              // Concat the new buffer with the remaining one
              buffer.copy(this.buffer, this.bufferOffset + this.bufferLength);
              this.bufferLength = newLength;
            }
            else {
              this.buffer = buffer;
              this.bufferOffset = 0;
              this.bufferLength = buffer.byteLength;
            }
          }
          handlePacket(offset, code, length, bytes) {
            switch (code) {
              case 50 /* MessageCodes.BindComplete */:
                return messages_1.bindComplete;
              case 49 /* MessageCodes.ParseComplete */:
                return messages_1.parseComplete;
              case 51 /* MessageCodes.CloseComplete */:
                return messages_1.closeComplete;
              case 110 /* MessageCodes.NoData */:
                return messages_1.noData;
              case 115 /* MessageCodes.PortalSuspended */:
                return messages_1.portalSuspended;
              case 99 /* MessageCodes.CopyDone */:
                return messages_1.copyDone;
              case 87 /* MessageCodes.ReplicationStart */:
                return messages_1.replicationStart;
              case 73 /* MessageCodes.EmptyQuery */:
                return messages_1.emptyQuery;
              case 68 /* MessageCodes.DataRow */:
                return this.parseDataRowMessage(offset, length, bytes);
              case 67 /* MessageCodes.CommandComplete */:
                return this.parseCommandCompleteMessage(offset, length, bytes);
              case 90 /* MessageCodes.ReadyForQuery */:
                return this.parseReadyForQueryMessage(offset, length, bytes);
              case 65 /* MessageCodes.NotificationResponse */:
                return this.parseNotificationMessage(offset, length, bytes);
              case 82 /* MessageCodes.AuthenticationResponse */:
                return this.parseAuthenticationResponse(offset, length, bytes);
              case 83 /* MessageCodes.ParameterStatus */:
                return this.parseParameterStatusMessage(offset, length, bytes);
              case 75 /* MessageCodes.BackendKeyData */:
                return this.parseBackendKeyData(offset, length, bytes);
              case 69 /* MessageCodes.ErrorMessage */:
                return this.parseErrorMessage(offset, length, bytes, 'error');
              case 78 /* MessageCodes.NoticeMessage */:
                return this.parseErrorMessage(offset, length, bytes, 'notice');
              case 84 /* MessageCodes.RowDescriptionMessage */:
                return this.parseRowDescriptionMessage(offset, length, bytes);
              case 116 /* MessageCodes.ParameterDescriptionMessage */:
                return this.parseParameterDescriptionMessage(offset, length, bytes);
              case 71 /* MessageCodes.CopyIn */:
                return this.parseCopyInMessage(offset, length, bytes);
              case 72 /* MessageCodes.CopyOut */:
                return this.parseCopyOutMessage(offset, length, bytes);
              case 100 /* MessageCodes.CopyData */:
                return this.parseCopyData(offset, length, bytes);
              default:
                return new messages_1.DatabaseError('received invalid response: ' + code.toString(16), length, 'error');
            }
          }
          parseReadyForQueryMessage(offset, length, bytes) {
            this.reader.setBuffer(offset, bytes);
            const status = this.reader.string(1);
            return new messages_1.ReadyForQueryMessage(length, status);
          }
          parseCommandCompleteMessage(offset, length, bytes) {
            this.reader.setBuffer(offset, bytes);
            const text = this.reader.cstring();
            return new messages_1.CommandCompleteMessage(length, text);
          }
          parseCopyData(offset, length, bytes) {
            const chunk = bytes.slice(offset, offset + (length - 4));
            return new messages_1.CopyDataMessage(length, chunk);
          }
          parseCopyInMessage(offset, length, bytes) {
            return this.parseCopyMessage(offset, length, bytes, 'copyInResponse');
          }
          parseCopyOutMessage(offset, length, bytes) {
            return this.parseCopyMessage(offset, length, bytes, 'copyOutResponse');
          }
          parseCopyMessage(offset, length, bytes, messageName) {
            this.reader.setBuffer(offset, bytes);
            const isBinary = this.reader.byte() !== 0;
            const columnCount = this.reader.int16();
            const message = new messages_1.CopyResponse(length, messageName, isBinary, columnCount);
            for (let i = 0; i < columnCount; i++) {
              message.columnTypes[i] = this.reader.int16();
            }
            return message;
          }
          parseNotificationMessage(offset, length, bytes) {
            this.reader.setBuffer(offset, bytes);
            const processId = this.reader.int32();
            const channel = this.reader.cstring();
            const payload = this.reader.cstring();
            return new messages_1.NotificationResponseMessage(length, processId, channel, payload);
          }
          parseRowDescriptionMessage(offset, length, bytes) {
            this.reader.setBuffer(offset, bytes);
            const fieldCount = this.reader.int16();
            const message = new messages_1.RowDescriptionMessage(length, fieldCount);
            for (let i = 0; i < fieldCount; i++) {
              message.fields[i] = this.parseField();
            }
            return message;
          }
          parseField() {
            const name = this.reader.cstring();
            const tableID = this.reader.uint32();
            const columnID = this.reader.int16();
            const dataTypeID = this.reader.uint32();
            const dataTypeSize = this.reader.int16();
            const dataTypeModifier = this.reader.int32();
            const mode = this.reader.int16() === 0 ? 'text' : 'binary';
            return new messages_1.Field(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, mode);
          }
          parseParameterDescriptionMessage(offset, length, bytes) {
            this.reader.setBuffer(offset, bytes);
            const parameterCount = this.reader.int16();
            const message = new messages_1.ParameterDescriptionMessage(length, parameterCount);
            for (let i = 0; i < parameterCount; i++) {
              message.dataTypeIDs[i] = this.reader.int32();
            }
            return message;
          }
          parseDataRowMessage(offset, length, bytes) {
            this.reader.setBuffer(offset, bytes);
            const fieldCount = this.reader.int16();
            const fields = new Array(fieldCount);
            for (let i = 0; i < fieldCount; i++) {
              const len = this.reader.int32();
              // a -1 for length means the value of the field is null
              fields[i] = len === -1 ? null : this.reader.string(len);
            }
            return new messages_1.DataRowMessage(length, fields);
          }
          parseParameterStatusMessage(offset, length, bytes) {
            this.reader.setBuffer(offset, bytes);
            const name = this.reader.cstring();
            const value = this.reader.cstring();
            return new messages_1.ParameterStatusMessage(length, name, value);
          }
          parseBackendKeyData(offset, length, bytes) {
            this.reader.setBuffer(offset, bytes);
            const processID = this.reader.int32();
            const secretKey = this.reader.int32();
            return new messages_1.BackendKeyDataMessage(length, processID, secretKey);
          }
          parseAuthenticationResponse(offset, length, bytes) {
            this.reader.setBuffer(offset, bytes);
            const code = this.reader.int32();
            // TODO(bmc): maybe better types here
            const message = {
              name: 'authenticationOk',
              length,
            };
            switch (code) {
              case 0: // AuthenticationOk
                break;
              case 3: // AuthenticationCleartextPassword
                if (message.length === 8) {
                  message.name = 'authenticationCleartextPassword';
                }
                break;
              case 5: // AuthenticationMD5Password
                if (message.length === 12) {
                  message.name = 'authenticationMD5Password';
                  const salt = this.reader.bytes(4);
                  return new messages_1.AuthenticationMD5Password(length, salt);
                }
                break;
              case 10: // AuthenticationSASL
                {
                  message.name = 'authenticationSASL';
                  message.mechanisms = [];
                  let mechanism;
                  do {
                    mechanism = this.reader.cstring();
                    if (mechanism) {
                      message.mechanisms.push(mechanism);
                    }
                  } while (mechanism);
                }
                break;
              case 11: // AuthenticationSASLContinue
                message.name = 'authenticationSASLContinue';
                message.data = this.reader.string(length - 8);
                break;
              case 12: // AuthenticationSASLFinal
                message.name = 'authenticationSASLFinal';
                message.data = this.reader.string(length - 8);
                break;
              default:
                throw new Error('Unknown authenticationOk message type ' + code);
            }
            return message;
          }
          parseErrorMessage(offset, length, bytes, name) {
            this.reader.setBuffer(offset, bytes);
            const fields = {};
            let fieldType = this.reader.string(1);
            while (fieldType !== '\0') {
              fields[fieldType] = this.reader.cstring();
              fieldType = this.reader.string(1);
            }
            const messageValue = fields.M;
            const message = name === 'notice' ? new messages_1.NoticeMessage(length, messageValue) : new messages_1.DatabaseError(messageValue, length, name);
            message.severity = fields.S;
            message.code = fields.C;
            message.detail = fields.D;
            message.hint = fields.H;
            message.position = fields.P;
            message.internalPosition = fields.p;
            message.internalQuery = fields.q;
            message.where = fields.W;
            message.schema = fields.s;
            message.table = fields.t;
            message.column = fields.c;
            message.dataType = fields.d;
            message.constraint = fields.n;
            message.file = fields.F;
            message.line = fields.L;
            message.routine = fields.R;
            return message;
          }
        }
        exports.Parser = Parser;
        //# sourceMappingURL=parser.js.map

        /***/
}),

/***/ 2954:
/***/ ((module) => {

        "use strict";


        module.exports = function parseBytea(input) {
          if (/^\\x/.test(input)) {
            // new 'hex' style response (pg >9.0)
            return new Buffer(input.substr(2), 'hex')
          }
          var output = ''
          var i = 0
          while (i < input.length) {
            if (input[i] !== '\\') {
              output += input[i]
              ++i
            } else {
              if (/[0-7]{3}/.test(input.substr(i + 1, 3))) {
                output += String.fromCharCode(parseInt(input.substr(i + 1, 3), 8))
                i += 4
              } else {
                var backslashes = 1
                while (i + backslashes < input.length && input[i + backslashes] === '\\') {
                  backslashes++
                }
                for (var k = 0; k < Math.floor(backslashes / 2); ++k) {
                  output += '\\'
                }
                i += Math.floor(backslashes / 2) * 2
              }
            }
          }
          return new Buffer(output, 'binary')
        }


        /***/
}),

/***/ 2959:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        var parseInt64 = __webpack_require__(9888);

        var parseBits = function (data, bits, offset, invert, callback) {
          offset = offset || 0;
          invert = invert || false;
          callback = callback || function (lastValue, newValue, bits) { return (lastValue * Math.pow(2, bits)) + newValue; };
          var offsetBytes = offset >> 3;

          var inv = function (value) {
            if (invert) {
              return ~value & 0xff;
            }

            return value;
          };

          // read first (maybe partial) byte
          var mask = 0xff;
          var firstBits = 8 - (offset % 8);
          if (bits < firstBits) {
            mask = (0xff << (8 - bits)) & 0xff;
            firstBits = bits;
          }

          if (offset) {
            mask = mask >> (offset % 8);
          }

          var result = 0;
          if ((offset % 8) + bits >= 8) {
            result = callback(0, inv(data[offsetBytes]) & mask, firstBits);
          }

          // read bytes
          var bytes = (bits + offset) >> 3;
          for (var i = offsetBytes + 1; i < bytes; i++) {
            result = callback(result, inv(data[i]), 8);
          }

          // bits to read, that are not a complete byte
          var lastBits = (bits + offset) % 8;
          if (lastBits > 0) {
            result = callback(result, inv(data[bytes]) >> (8 - lastBits), lastBits);
          }

          return result;
        };

        var parseFloatFromBits = function (data, precisionBits, exponentBits) {
          var bias = Math.pow(2, exponentBits - 1) - 1;
          var sign = parseBits(data, 1);
          var exponent = parseBits(data, exponentBits, 1);

          if (exponent === 0) {
            return 0;
          }

          // parse mantissa
          var precisionBitsCounter = 1;
          var parsePrecisionBits = function (lastValue, newValue, bits) {
            if (lastValue === 0) {
              lastValue = 1;
            }

            for (var i = 1; i <= bits; i++) {
              precisionBitsCounter /= 2;
              if ((newValue & (0x1 << (bits - i))) > 0) {
                lastValue += precisionBitsCounter;
              }
            }

            return lastValue;
          };

          var mantissa = parseBits(data, precisionBits, exponentBits + 1, false, parsePrecisionBits);

          // special cases
          if (exponent == (Math.pow(2, exponentBits + 1) - 1)) {
            if (mantissa === 0) {
              return (sign === 0) ? Infinity : -Infinity;
            }

            return NaN;
          }

          // normale number
          return ((sign === 0) ? 1 : -1) * Math.pow(2, exponent - bias) * mantissa;
        };

        var parseInt16 = function (value) {
          if (parseBits(value, 1) == 1) {
            return -1 * (parseBits(value, 15, 1, true) + 1);
          }

          return parseBits(value, 15, 1);
        };

        var parseInt32 = function (value) {
          if (parseBits(value, 1) == 1) {
            return -1 * (parseBits(value, 31, 1, true) + 1);
          }

          return parseBits(value, 31, 1);
        };

        var parseFloat32 = function (value) {
          return parseFloatFromBits(value, 23, 8);
        };

        var parseFloat64 = function (value) {
          return parseFloatFromBits(value, 52, 11);
        };

        var parseNumeric = function (value) {
          var sign = parseBits(value, 16, 32);
          if (sign == 0xc000) {
            return NaN;
          }

          var weight = Math.pow(10000, parseBits(value, 16, 16));
          var result = 0;

          var digits = [];
          var ndigits = parseBits(value, 16);
          for (var i = 0; i < ndigits; i++) {
            result += parseBits(value, 16, 64 + (16 * i)) * weight;
            weight /= 10000;
          }

          var scale = Math.pow(10, parseBits(value, 16, 48));
          return ((sign === 0) ? 1 : -1) * Math.round(result * scale) / scale;
        };

        var parseDate = function (isUTC, value) {
          var sign = parseBits(value, 1);
          var rawValue = parseBits(value, 63, 1);

          // discard usecs and shift from 2000 to 1970
          var result = new Date((((sign === 0) ? 1 : -1) * rawValue / 1000) + 946684800000);

          if (!isUTC) {
            result.setTime(result.getTime() + result.getTimezoneOffset() * 60000);
          }

          // add microseconds to the date
          result.usec = rawValue % 1000;
          result.getMicroSeconds = function () {
            return this.usec;
          };
          result.setMicroSeconds = function (value) {
            this.usec = value;
          };
          result.getUTCMicroSeconds = function () {
            return this.usec;
          };

          return result;
        };

        var parseArray = function (value) {
          var dim = parseBits(value, 32);

          var flags = parseBits(value, 32, 32);
          var elementType = parseBits(value, 32, 64);

          var offset = 96;
          var dims = [];
          for (var i = 0; i < dim; i++) {
            // parse dimension
            dims[i] = parseBits(value, 32, offset);
            offset += 32;

            // ignore lower bounds
            offset += 32;
          }

          var parseElement = function (elementType) {
            // parse content length
            var length = parseBits(value, 32, offset);
            offset += 32;

            // parse null values
            if (length == 0xffffffff) {
              return null;
            }

            var result;
            if ((elementType == 0x17) || (elementType == 0x14)) {
              // int/bigint
              result = parseBits(value, length * 8, offset);
              offset += length * 8;
              return result;
            }
            else if (elementType == 0x19) {
              // string
              result = value.toString(this.encoding, offset >> 3, (offset += (length << 3)) >> 3);
              return result;
            }
            else {
              console.log("ERROR: ElementType not implemented: " + elementType);
            }
          };

          var parse = function (dimension, elementType) {
            var array = [];
            var i;

            if (dimension.length > 1) {
              var count = dimension.shift();
              for (i = 0; i < count; i++) {
                array[i] = parse(dimension, elementType);
              }
              dimension.unshift(count);
            }
            else {
              for (i = 0; i < dimension[0]; i++) {
                array[i] = parseElement(elementType);
              }
            }

            return array;
          };

          return parse(dims, elementType);
        };

        var parseText = function (value) {
          return value.toString('utf8');
        };

        var parseBool = function (value) {
          if (value === null) return null;
          return (parseBits(value, 8) > 0);
        };

        var init = function (register) {
          register(20, parseInt64);
          register(21, parseInt16);
          register(23, parseInt32);
          register(26, parseInt32);
          register(1700, parseNumeric);
          register(700, parseFloat32);
          register(701, parseFloat64);
          register(16, parseBool);
          register(1114, parseDate.bind(null, false));
          register(1184, parseDate.bind(null, true));
          register(1000, parseArray);
          register(1007, parseArray);
          register(1016, parseArray);
          register(1008, parseArray);
          register(1009, parseArray);
          register(25, parseText);
        };

        module.exports = {
          init: init
        };


        /***/
}),

/***/ 3193:
/***/ ((module) => {

        "use strict";
        module.exports = require("string_decoder");

        /***/
}),

/***/ 3556:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        const { EventEmitter } = __webpack_require__(4434)

        const Result = __webpack_require__(4295)
        const utils = __webpack_require__(2341)

        class Query extends EventEmitter {
          constructor(config, values, callback) {
            super()

            config = utils.normalizeQueryConfig(config, values, callback)

            this.text = config.text
            this.values = config.values
            this.rows = config.rows
            this.types = config.types
            this.name = config.name
            this.queryMode = config.queryMode
            this.binary = config.binary
            // use unique portal name each time
            this.portal = config.portal || ''
            this.callback = config.callback
            this._rowMode = config.rowMode
            if (process.domain && config.callback) {
              this.callback = process.domain.bind(config.callback)
            }
            this._result = new Result(this._rowMode, this.types)

            // potential for multiple results
            this._results = this._result
            this._canceledDueToError = false
          }

          requiresPreparation() {
            if (this.queryMode === 'extended') {
              return true
            }

            // named queries must always be prepared
            if (this.name) {
              return true
            }
            // always prepare if there are max number of rows expected per
            // portal execution
            if (this.rows) {
              return true
            }
            // don't prepare empty text queries
            if (!this.text) {
              return false
            }
            // prepare if there are values
            if (!this.values) {
              return false
            }
            return this.values.length > 0
          }

          _checkForMultirow() {
            // if we already have a result with a command property
            // then we've already executed one query in a multi-statement simple query
            // turn our results into an array of results
            if (this._result.command) {
              if (!Array.isArray(this._results)) {
                this._results = [this._result]
              }
              this._result = new Result(this._rowMode, this._result._types)
              this._results.push(this._result)
            }
          }

          // associates row metadata from the supplied
          // message with this query object
          // metadata used when parsing row results
          handleRowDescription(msg) {
            this._checkForMultirow()
            this._result.addFields(msg.fields)
            this._accumulateRows = this.callback || !this.listeners('row').length
          }

          handleDataRow(msg) {
            let row

            if (this._canceledDueToError) {
              return
            }

            try {
              row = this._result.parseRow(msg.fields)
            } catch (err) {
              this._canceledDueToError = err
              return
            }

            this.emit('row', row, this._result)
            if (this._accumulateRows) {
              this._result.addRow(row)
            }
          }

          handleCommandComplete(msg, connection) {
            this._checkForMultirow()
            this._result.addCommandComplete(msg)
            // need to sync after each command complete of a prepared statement
            // if we were using a row count which results in multiple calls to _getRows
            if (this.rows) {
              connection.sync()
            }
          }

          // if a named prepared statement is created with empty query text
          // the backend will send an emptyQuery message but *not* a command complete message
          // since we pipeline sync immediately after execute we don't need to do anything here
          // unless we have rows specified, in which case we did not pipeline the initial sync call
          handleEmptyQuery(connection) {
            if (this.rows) {
              connection.sync()
            }
          }

          handleError(err, connection) {
            // need to sync after error during a prepared statement
            if (this._canceledDueToError) {
              err = this._canceledDueToError
              this._canceledDueToError = false
            }
            // if callback supplied do not emit error event as uncaught error
            // events will bubble up to node process
            if (this.callback) {
              return this.callback(err)
            }
            this.emit('error', err)
          }

          handleReadyForQuery(con) {
            if (this._canceledDueToError) {
              return this.handleError(this._canceledDueToError, con)
            }
            if (this.callback) {
              try {
                this.callback(null, this._results)
              } catch (err) {
                process.nextTick(() => {
                  throw err
                })
              }
            }
            this.emit('end', this._results)
          }

          submit(connection) {
            if (typeof this.text !== 'string' && typeof this.name !== 'string') {
              return new Error('A query must have either text or a name. Supplying neither is unsupported.')
            }
            const previous = connection.parsedStatements[this.name]
            if (this.text && previous && this.text !== previous) {
              return new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`)
            }
            if (this.values && !Array.isArray(this.values)) {
              return new Error('Query values must be an array')
            }
            if (this.requiresPreparation()) {
              // If we're using the extended query protocol we fire off several separate commands
              // to the backend. On some versions of node & some operating system versions
              // the network stack writes each message separately instead of buffering them together
              // causing the client & network to send more slowly. Corking & uncorking the stream
              // allows node to buffer up the messages internally before sending them all off at once.
              // note: we're checking for existence of cork/uncork because some versions of streams
              // might not have this (cloudflare?)
              connection.stream.cork && connection.stream.cork()
              try {
                this.prepare(connection)
              } finally {
                // while unlikely for this.prepare to throw, if it does & we don't uncork this stream
                // this client becomes unresponsive, so put in finally block "just in case"
                connection.stream.uncork && connection.stream.uncork()
              }
            } else {
              connection.query(this.text)
            }
            return null
          }

          hasBeenParsed(connection) {
            return this.name && connection.parsedStatements[this.name]
          }

          handlePortalSuspended(connection) {
            this._getRows(connection, this.rows)
          }

          _getRows(connection, rows) {
            connection.execute({
              portal: this.portal,
              rows: rows,
            })
            // if we're not reading pages of rows send the sync command
            // to indicate the pipeline is finished
            if (!rows) {
              connection.sync()
            } else {
              // otherwise flush the call out to read more rows
              connection.flush()
            }
          }

          // http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
          prepare(connection) {
            // TODO refactor this poor encapsulation
            if (!this.hasBeenParsed(connection)) {
              connection.parse({
                text: this.text,
                name: this.name,
                types: this.types,
              })
            }

            // because we're mapping user supplied values to
            // postgres wire protocol compatible values it could
            // throw an exception, so try/catch this section
            try {
              connection.bind({
                portal: this.portal,
                statement: this.name,
                values: this.values,
                binary: this.binary,
                valueMapper: utils.prepareValue,
              })
            } catch (err) {
              this.handleError(err, connection)
              return
            }

            connection.describe({
              type: 'P',
              name: this.portal || '',
            })

            this._getRows(connection, this.rows)
          }

          handleCopyInResponse(connection) {
            connection.sendCopyFail('No source stream defined')
          }

          handleCopyData(msg, connection) {
            // noop
          }
        }

        module.exports = Query


        /***/
}),

/***/ 3643:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        // eslint-disable-next-line
        var Native
        // eslint-disable-next-line no-useless-catch
        try {
          // Wrap this `require()` in a try-catch to avoid upstream bundlers from complaining that this might not be available since it is an optional import
          Native = __webpack_require__(8583)
        } catch (e) {
          throw e
        }
        const TypeOverrides = __webpack_require__(8686)
        const EventEmitter = (__webpack_require__(4434).EventEmitter)
        const util = __webpack_require__(9023)
        const ConnectionParameters = __webpack_require__(6331)

        const NativeQuery = __webpack_require__(6594)

        const Client = (module.exports = function (config) {
          EventEmitter.call(this)
          config = config || {}

          this._Promise = config.Promise || global.Promise
          this._types = new TypeOverrides(config.types)

          this.native = new Native({
            types: this._types,
          })

          this._queryQueue = []
          this._ending = false
          this._connecting = false
          this._connected = false
          this._queryable = true

          // keep these on the object for legacy reasons
          // for the time being. TODO: deprecate all this jazz
          const cp = (this.connectionParameters = new ConnectionParameters(config))
          if (config.nativeConnectionString) cp.nativeConnectionString = config.nativeConnectionString
          this.user = cp.user

          // "hiding" the password so it doesn't show up in stack traces
          // or if the client is console.logged
          Object.defineProperty(this, 'password', {
            configurable: true,
            enumerable: false,
            writable: true,
            value: cp.password,
          })
          this.database = cp.database
          this.host = cp.host
          this.port = cp.port

          // a hash to hold named queries
          this.namedQueries = {}
        })

        Client.Query = NativeQuery

        util.inherits(Client, EventEmitter)

        Client.prototype._errorAllQueries = function (err) {
          const enqueueError = (query) => {
            process.nextTick(() => {
              query.native = this.native
              query.handleError(err)
            })
          }

          if (this._hasActiveQuery()) {
            enqueueError(this._activeQuery)
            this._activeQuery = null
          }

          this._queryQueue.forEach(enqueueError)
          this._queryQueue.length = 0
        }

        // connect to the backend
        // pass an optional callback to be called once connected
        // or with an error if there was a connection error
        Client.prototype._connect = function (cb) {
          const self = this

          if (this._connecting) {
            process.nextTick(() => cb(new Error('Client has already been connected. You cannot reuse a client.')))
            return
          }

          this._connecting = true

          this.connectionParameters.getLibpqConnectionString(function (err, conString) {
            if (self.connectionParameters.nativeConnectionString) conString = self.connectionParameters.nativeConnectionString
            if (err) return cb(err)
            self.native.connect(conString, function (err) {
              if (err) {
                self.native.end()
                return cb(err)
              }

              // set internal states to connected
              self._connected = true

              // handle connection errors from the native layer
              self.native.on('error', function (err) {
                self._queryable = false
                self._errorAllQueries(err)
                self.emit('error', err)
              })

              self.native.on('notification', function (msg) {
                self.emit('notification', {
                  channel: msg.relname,
                  payload: msg.extra,
                })
              })

              // signal we are connected now
              self.emit('connect')
              self._pulseQueryQueue(true)

              cb()
            })
          })
        }

        Client.prototype.connect = function (callback) {
          if (callback) {
            this._connect(callback)
            return
          }

          return new this._Promise((resolve, reject) => {
            this._connect((error) => {
              if (error) {
                reject(error)
              } else {
                resolve()
              }
            })
          })
        }

        // send a query to the server
        // this method is highly overloaded to take
        // 1) string query, optional array of parameters, optional function callback
        // 2) object query with {
        //    string query
        //    optional array values,
        //    optional function callback instead of as a separate parameter
        //    optional string name to name & cache the query plan
        //    optional string rowMode = 'array' for an array of results
        //  }
        Client.prototype.query = function (config, values, callback) {
          let query
          let result
          let readTimeout
          let readTimeoutTimer
          let queryCallback

          if (config === null || config === undefined) {
            throw new TypeError('Client was passed a null or undefined query')
          } else if (typeof config.submit === 'function') {
            readTimeout = config.query_timeout || this.connectionParameters.query_timeout
            result = query = config
            // accept query(new Query(...), (err, res) => { }) style
            if (typeof values === 'function') {
              config.callback = values
            }
          } else {
            readTimeout = config.query_timeout || this.connectionParameters.query_timeout
            query = new NativeQuery(config, values, callback)
            if (!query.callback) {
              let resolveOut, rejectOut
              result = new this._Promise((resolve, reject) => {
                resolveOut = resolve
                rejectOut = reject
              }).catch((err) => {
                Error.captureStackTrace(err)
                throw err
              })
              query.callback = (err, res) => (err ? rejectOut(err) : resolveOut(res))
            }
          }

          if (readTimeout) {
            queryCallback = query.callback

            readTimeoutTimer = setTimeout(() => {
              const error = new Error('Query read timeout')

              process.nextTick(() => {
                query.handleError(error, this.connection)
              })

              queryCallback(error)

              // we already returned an error,
              // just do nothing if query completes
              query.callback = () => { }

              // Remove from queue
              const index = this._queryQueue.indexOf(query)
              if (index > -1) {
                this._queryQueue.splice(index, 1)
              }

              this._pulseQueryQueue()
            }, readTimeout)

            query.callback = (err, res) => {
              clearTimeout(readTimeoutTimer)
              queryCallback(err, res)
            }
          }

          if (!this._queryable) {
            query.native = this.native
            process.nextTick(() => {
              query.handleError(new Error('Client has encountered a connection error and is not queryable'))
            })
            return result
          }

          if (this._ending) {
            query.native = this.native
            process.nextTick(() => {
              query.handleError(new Error('Client was closed and is not queryable'))
            })
            return result
          }

          this._queryQueue.push(query)
          this._pulseQueryQueue()
          return result
        }

        // disconnect from the backend server
        Client.prototype.end = function (cb) {
          const self = this

          this._ending = true

          if (!this._connected) {
            this.once('connect', this.end.bind(this, cb))
          }
          let result
          if (!cb) {
            result = new this._Promise(function (resolve, reject) {
              cb = (err) => (err ? reject(err) : resolve())
            })
          }
          this.native.end(function () {
            self._errorAllQueries(new Error('Connection terminated'))

            process.nextTick(() => {
              self.emit('end')
              if (cb) cb()
            })
          })
          return result
        }

        Client.prototype._hasActiveQuery = function () {
          return this._activeQuery && this._activeQuery.state !== 'error' && this._activeQuery.state !== 'end'
        }

        Client.prototype._pulseQueryQueue = function (initialConnection) {
          if (!this._connected) {
            return
          }
          if (this._hasActiveQuery()) {
            return
          }
          const query = this._queryQueue.shift()
          if (!query) {
            if (!initialConnection) {
              this.emit('drain')
            }
            return
          }
          this._activeQuery = query
          query.submit(this)
          const self = this
          query.once('_done', function () {
            self._pulseQueryQueue()
          })
        }

        // attempt to cancel an in-progress query
        Client.prototype.cancel = function (query) {
          if (this._activeQuery === query) {
            this.native.cancel(function () { })
          } else if (this._queryQueue.indexOf(query) !== -1) {
            this._queryQueue.splice(this._queryQueue.indexOf(query), 1)
          }
        }

        Client.prototype.ref = function () { }
        Client.prototype.unref = function () { }

        Client.prototype.setTypeParser = function (oid, format, parseFn) {
          return this._types.setTypeParser(oid, format, parseFn)
        }

        Client.prototype.getTypeParser = function (oid, format) {
          return this._types.getTypeParser(oid, format)
        }


        /***/
}),

/***/ 3780:
/***/ ((__unused_webpack_module, exports) => {

        "use strict";

        Object.defineProperty(exports, "__esModule", ({ value: true }));
        // This is an empty module that is served up when outside of a workerd environment
        // See the `exports` field in package.json
        exports["default"] = {};
        //# sourceMappingURL=empty.js.map

        /***/
}),

/***/ 3988:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

        var textParsers = __webpack_require__(4561);
        var binaryParsers = __webpack_require__(2959);
        var arrayParser = __webpack_require__(8282);
        var builtinTypes = __webpack_require__(1010);

        exports.getTypeParser = getTypeParser;
        exports.setTypeParser = setTypeParser;
        exports.arrayParser = arrayParser;
        exports.builtins = builtinTypes;

        var typeParsers = {
          text: {},
          binary: {}
        };

        //the empty parse function
        function noParse(val) {
          return String(val);
        };

        //returns a function used to convert a specific type (specified by
        //oid) into a result javascript type
        //note: the oid can be obtained via the following sql query:
        //SELECT oid FROM pg_type WHERE typname = 'TYPE_NAME_HERE';
        function getTypeParser(oid, format) {
          format = format || 'text';
          if (!typeParsers[format]) {
            return noParse;
          }
          return typeParsers[format][oid] || noParse;
        };

        function setTypeParser(oid, format, parseFn) {
          if (typeof format == 'function') {
            parseFn = format;
            format = 'text';
          }
          typeParsers[format][oid] = parseFn;
        };

        textParsers.init(function (oid, converter) {
          typeParsers.text[oid] = converter;
        });

        binaryParsers.init(function (oid, converter) {
          typeParsers.binary[oid] = converter;
        });


        /***/
}),

/***/ 4295:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        const types = __webpack_require__(3988)

        const matchRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/

        // result object returned from query
        // in the 'end' event and also
        // passed as second argument to provided callback
        class Result {
          constructor(rowMode, types) {
            this.command = null
            this.rowCount = null
            this.oid = null
            this.rows = []
            this.fields = []
            this._parsers = undefined
            this._types = types
            this.RowCtor = null
            this.rowAsArray = rowMode === 'array'
            if (this.rowAsArray) {
              this.parseRow = this._parseRowAsArray
            }
            this._prebuiltEmptyResultObject = null
          }

          // adds a command complete message
          addCommandComplete(msg) {
            let match
            if (msg.text) {
              // pure javascript
              match = matchRegexp.exec(msg.text)
            } else {
              // native bindings
              match = matchRegexp.exec(msg.command)
            }
            if (match) {
              this.command = match[1]
              if (match[3]) {
                // COMMAND OID ROWS
                this.oid = parseInt(match[2], 10)
                this.rowCount = parseInt(match[3], 10)
              } else if (match[2]) {
                // COMMAND ROWS
                this.rowCount = parseInt(match[2], 10)
              }
            }
          }

          _parseRowAsArray(rowData) {
            const row = new Array(rowData.length)
            for (let i = 0, len = rowData.length; i < len; i++) {
              const rawValue = rowData[i]
              if (rawValue !== null) {
                row[i] = this._parsers[i](rawValue)
              } else {
                row[i] = null
              }
            }
            return row
          }

          parseRow(rowData) {
            const row = { ...this._prebuiltEmptyResultObject }
            for (let i = 0, len = rowData.length; i < len; i++) {
              const rawValue = rowData[i]
              const field = this.fields[i].name
              if (rawValue !== null) {
                const v = this.fields[i].format === 'binary' ? Buffer.from(rawValue) : rawValue
                row[field] = this._parsers[i](v)
              } else {
                row[field] = null
              }
            }
            return row
          }

          addRow(row) {
            this.rows.push(row)
          }

          addFields(fieldDescriptions) {
            // clears field definitions
            // multiple query statements in 1 action can result in multiple sets
            // of rowDescriptions...eg: 'select NOW(); select 1::int;'
            // you need to reset the fields
            this.fields = fieldDescriptions
            if (this.fields.length) {
              this._parsers = new Array(fieldDescriptions.length)
            }

            const row = {}

            for (let i = 0; i < fieldDescriptions.length; i++) {
              const desc = fieldDescriptions[i]
              row[desc.name] = null

              if (this._types) {
                this._parsers[i] = this._types.getTypeParser(desc.dataTypeID, desc.format || 'text')
              } else {
                this._parsers[i] = types.getTypeParser(desc.dataTypeID, desc.format || 'text')
              }
            }

            this._prebuiltEmptyResultObject = { ...row }
          }
        }

        module.exports = Result


        /***/
}),

/***/ 4434:
/***/ ((module) => {

        "use strict";
        module.exports = require("events");

        /***/
}),

/***/ 4561:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        var array = __webpack_require__(6606)
        var arrayParser = __webpack_require__(8282);
        var parseDate = __webpack_require__(9141);
        var parseInterval = __webpack_require__(8244);
        var parseByteA = __webpack_require__(2954);

        function allowNull(fn) {
          return function nullAllowed(value) {
            if (value === null) return value
            return fn(value)
          }
        }

        function parseBool(value) {
          if (value === null) return value
          return value === 'TRUE' ||
            value === 't' ||
            value === 'true' ||
            value === 'y' ||
            value === 'yes' ||
            value === 'on' ||
            value === '1';
        }

        function parseBoolArray(value) {
          if (!value) return null
          return array.parse(value, parseBool)
        }

        function parseBaseTenInt(string) {
          return parseInt(string, 10)
        }

        function parseIntegerArray(value) {
          if (!value) return null
          return array.parse(value, allowNull(parseBaseTenInt))
        }

        function parseBigIntegerArray(value) {
          if (!value) return null
          return array.parse(value, allowNull(function (entry) {
            return parseBigInteger(entry).trim()
          }))
        }

        var parsePointArray = function (value) {
          if (!value) { return null; }
          var p = arrayParser.create(value, function (entry) {
            if (entry !== null) {
              entry = parsePoint(entry);
            }
            return entry;
          });

          return p.parse();
        };

        var parseFloatArray = function (value) {
          if (!value) { return null; }
          var p = arrayParser.create(value, function (entry) {
            if (entry !== null) {
              entry = parseFloat(entry);
            }
            return entry;
          });

          return p.parse();
        };

        var parseStringArray = function (value) {
          if (!value) { return null; }

          var p = arrayParser.create(value);
          return p.parse();
        };

        var parseDateArray = function (value) {
          if (!value) { return null; }

          var p = arrayParser.create(value, function (entry) {
            if (entry !== null) {
              entry = parseDate(entry);
            }
            return entry;
          });

          return p.parse();
        };

        var parseIntervalArray = function (value) {
          if (!value) { return null; }

          var p = arrayParser.create(value, function (entry) {
            if (entry !== null) {
              entry = parseInterval(entry);
            }
            return entry;
          });

          return p.parse();
        };

        var parseByteAArray = function (value) {
          if (!value) { return null; }

          return array.parse(value, allowNull(parseByteA));
        };

        var parseInteger = function (value) {
          return parseInt(value, 10);
        };

        var parseBigInteger = function (value) {
          var valStr = String(value);
          if (/^\d+$/.test(valStr)) { return valStr; }
          return value;
        };

        var parseJsonArray = function (value) {
          if (!value) { return null; }

          return array.parse(value, allowNull(JSON.parse));
        };

        var parsePoint = function (value) {
          if (value[0] !== '(') { return null; }

          value = value.substring(1, value.length - 1).split(',');

          return {
            x: parseFloat(value[0])
            , y: parseFloat(value[1])
          };
        };

        var parseCircle = function (value) {
          if (value[0] !== '<' && value[1] !== '(') { return null; }

          var point = '(';
          var radius = '';
          var pointParsed = false;
          for (var i = 2; i < value.length - 1; i++) {
            if (!pointParsed) {
              point += value[i];
            }

            if (value[i] === ')') {
              pointParsed = true;
              continue;
            } else if (!pointParsed) {
              continue;
            }

            if (value[i] === ',') {
              continue;
            }

            radius += value[i];
          }
          var result = parsePoint(point);
          result.radius = parseFloat(radius);

          return result;
        };

        var init = function (register) {
          register(20, parseBigInteger); // int8
          register(21, parseInteger); // int2
          register(23, parseInteger); // int4
          register(26, parseInteger); // oid
          register(700, parseFloat); // float4/real
          register(701, parseFloat); // float8/double
          register(16, parseBool);
          register(1082, parseDate); // date
          register(1114, parseDate); // timestamp without timezone
          register(1184, parseDate); // timestamp
          register(600, parsePoint); // point
          register(651, parseStringArray); // cidr[]
          register(718, parseCircle); // circle
          register(1000, parseBoolArray);
          register(1001, parseByteAArray);
          register(1005, parseIntegerArray); // _int2
          register(1007, parseIntegerArray); // _int4
          register(1028, parseIntegerArray); // oid[]
          register(1016, parseBigIntegerArray); // _int8
          register(1017, parsePointArray); // point[]
          register(1021, parseFloatArray); // _float4
          register(1022, parseFloatArray); // _float8
          register(1231, parseFloatArray); // _numeric
          register(1014, parseStringArray); //char
          register(1015, parseStringArray); //varchar
          register(1008, parseStringArray);
          register(1009, parseStringArray);
          register(1040, parseStringArray); // macaddr[]
          register(1041, parseStringArray); // inet[]
          register(1115, parseDateArray); // timestamp without time zone[]
          register(1182, parseDateArray); // _date
          register(1185, parseDateArray); // timestamp with time zone[]
          register(1186, parseInterval);
          register(1187, parseIntervalArray);
          register(17, parseByteA);
          register(114, JSON.parse.bind(JSON)); // json
          register(3802, JSON.parse.bind(JSON)); // jsonb
          register(199, parseJsonArray); // json[]
          register(3807, parseJsonArray); // jsonb[]
          register(3907, parseStringArray); // numrange[]
          register(2951, parseStringArray); // uuid[]
          register(791, parseStringArray); // money[]
          register(1183, parseStringArray); // time[]
          register(1270, parseStringArray); // timetz[]
        };

        module.exports = {
          init: init
        };


        /***/
}),

/***/ 4615:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";
        /*
        Copyright (c) 2014-2021, Matteo Collina <hello@matteocollina.com>
        
        Permission to use, copy, modify, and/or distribute this software for any
        purpose with or without fee is hereby granted, provided that the above
        copyright notice and this permission notice appear in all copies.
        
        THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
        WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
        MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
        ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
        WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
        ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR
        IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
        */



        const { Transform } = __webpack_require__(2203)
        const { StringDecoder } = __webpack_require__(3193)
        const kLast = Symbol('last')
        const kDecoder = Symbol('decoder')

        function transform(chunk, enc, cb) {
          let list
          if (this.overflow) { // Line buffer is full. Skip to start of next line.
            const buf = this[kDecoder].write(chunk)
            list = buf.split(this.matcher)

            if (list.length === 1) return cb() // Line ending not found. Discard entire chunk.

            // Line ending found. Discard trailing fragment of previous line and reset overflow state.
            list.shift()
            this.overflow = false
          } else {
            this[kLast] += this[kDecoder].write(chunk)
            list = this[kLast].split(this.matcher)
          }

          this[kLast] = list.pop()

          for (let i = 0; i < list.length; i++) {
            try {
              push(this, this.mapper(list[i]))
            } catch (error) {
              return cb(error)
            }
          }

          this.overflow = this[kLast].length > this.maxLength
          if (this.overflow && !this.skipOverflow) {
            cb(new Error('maximum buffer reached'))
            return
          }

          cb()
        }

        function flush(cb) {
          // forward any gibberish left in there
          this[kLast] += this[kDecoder].end()

          if (this[kLast]) {
            try {
              push(this, this.mapper(this[kLast]))
            } catch (error) {
              return cb(error)
            }
          }

          cb()
        }

        function push(self, val) {
          if (val !== undefined) {
            self.push(val)
          }
        }

        function noop(incoming) {
          return incoming
        }

        function split(matcher, mapper, options) {
          // Set defaults for any arguments not supplied.
          matcher = matcher || /\r?\n/
          mapper = mapper || noop
          options = options || {}

          // Test arguments explicitly.
          switch (arguments.length) {
            case 1:
              // If mapper is only argument.
              if (typeof matcher === 'function') {
                mapper = matcher
                matcher = /\r?\n/
                // If options is only argument.
              } else if (typeof matcher === 'object' && !(matcher instanceof RegExp) && !matcher[Symbol.split]) {
                options = matcher
                matcher = /\r?\n/
              }
              break

            case 2:
              // If mapper and options are arguments.
              if (typeof matcher === 'function') {
                options = mapper
                mapper = matcher
                matcher = /\r?\n/
                // If matcher and options are arguments.
              } else if (typeof mapper === 'object') {
                options = mapper
                mapper = noop
              }
          }

          options = Object.assign({}, options)
          options.autoDestroy = true
          options.transform = transform
          options.flush = flush
          options.readableObjectMode = true

          const stream = new Transform(options)

          stream[kLast] = ''
          stream[kDecoder] = new StringDecoder('utf8')
          stream.matcher = matcher
          stream.mapper = mapper
          stream.maxLength = options.maxLength
          stream.skipOverflow = options.skipOverflow || false
          stream.overflow = false
          stream._destroy = function (err, cb) {
            // Weird Node v12 bug that we need to work around
            this._writableState.errorEmitted = false
            cb(err)
          }

          return stream
        }

        module.exports = split


        /***/
}),

/***/ 4618:
/***/ ((__unused_webpack_module, exports) => {

        "use strict";

        Object.defineProperty(exports, "__esModule", ({ value: true }));
        exports.NoticeMessage = exports.DataRowMessage = exports.CommandCompleteMessage = exports.ReadyForQueryMessage = exports.NotificationResponseMessage = exports.BackendKeyDataMessage = exports.AuthenticationMD5Password = exports.ParameterStatusMessage = exports.ParameterDescriptionMessage = exports.RowDescriptionMessage = exports.Field = exports.CopyResponse = exports.CopyDataMessage = exports.DatabaseError = exports.copyDone = exports.emptyQuery = exports.replicationStart = exports.portalSuspended = exports.noData = exports.closeComplete = exports.bindComplete = exports.parseComplete = void 0;
        exports.parseComplete = {
          name: 'parseComplete',
          length: 5,
        };
        exports.bindComplete = {
          name: 'bindComplete',
          length: 5,
        };
        exports.closeComplete = {
          name: 'closeComplete',
          length: 5,
        };
        exports.noData = {
          name: 'noData',
          length: 5,
        };
        exports.portalSuspended = {
          name: 'portalSuspended',
          length: 5,
        };
        exports.replicationStart = {
          name: 'replicationStart',
          length: 4,
        };
        exports.emptyQuery = {
          name: 'emptyQuery',
          length: 4,
        };
        exports.copyDone = {
          name: 'copyDone',
          length: 4,
        };
        class DatabaseError extends Error {
          constructor(message, length, name) {
            super(message);
            this.length = length;
            this.name = name;
          }
        }
        exports.DatabaseError = DatabaseError;
        class CopyDataMessage {
          constructor(length, chunk) {
            this.length = length;
            this.chunk = chunk;
            this.name = 'copyData';
          }
        }
        exports.CopyDataMessage = CopyDataMessage;
        class CopyResponse {
          constructor(length, name, binary, columnCount) {
            this.length = length;
            this.name = name;
            this.binary = binary;
            this.columnTypes = new Array(columnCount);
          }
        }
        exports.CopyResponse = CopyResponse;
        class Field {
          constructor(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, format) {
            this.name = name;
            this.tableID = tableID;
            this.columnID = columnID;
            this.dataTypeID = dataTypeID;
            this.dataTypeSize = dataTypeSize;
            this.dataTypeModifier = dataTypeModifier;
            this.format = format;
          }
        }
        exports.Field = Field;
        class RowDescriptionMessage {
          constructor(length, fieldCount) {
            this.length = length;
            this.fieldCount = fieldCount;
            this.name = 'rowDescription';
            this.fields = new Array(this.fieldCount);
          }
        }
        exports.RowDescriptionMessage = RowDescriptionMessage;
        class ParameterDescriptionMessage {
          constructor(length, parameterCount) {
            this.length = length;
            this.parameterCount = parameterCount;
            this.name = 'parameterDescription';
            this.dataTypeIDs = new Array(this.parameterCount);
          }
        }
        exports.ParameterDescriptionMessage = ParameterDescriptionMessage;
        class ParameterStatusMessage {
          constructor(length, parameterName, parameterValue) {
            this.length = length;
            this.parameterName = parameterName;
            this.parameterValue = parameterValue;
            this.name = 'parameterStatus';
          }
        }
        exports.ParameterStatusMessage = ParameterStatusMessage;
        class AuthenticationMD5Password {
          constructor(length, salt) {
            this.length = length;
            this.salt = salt;
            this.name = 'authenticationMD5Password';
          }
        }
        exports.AuthenticationMD5Password = AuthenticationMD5Password;
        class BackendKeyDataMessage {
          constructor(length, processID, secretKey) {
            this.length = length;
            this.processID = processID;
            this.secretKey = secretKey;
            this.name = 'backendKeyData';
          }
        }
        exports.BackendKeyDataMessage = BackendKeyDataMessage;
        class NotificationResponseMessage {
          constructor(length, processId, channel, payload) {
            this.length = length;
            this.processId = processId;
            this.channel = channel;
            this.payload = payload;
            this.name = 'notification';
          }
        }
        exports.NotificationResponseMessage = NotificationResponseMessage;
        class ReadyForQueryMessage {
          constructor(length, status) {
            this.length = length;
            this.status = status;
            this.name = 'readyForQuery';
          }
        }
        exports.ReadyForQueryMessage = ReadyForQueryMessage;
        class CommandCompleteMessage {
          constructor(length, text) {
            this.length = length;
            this.text = text;
            this.name = 'commandComplete';
          }
        }
        exports.CommandCompleteMessage = CommandCompleteMessage;
        class DataRowMessage {
          constructor(length, fields) {
            this.length = length;
            this.fields = fields;
            this.name = 'dataRow';
            this.fieldCount = fields.length;
          }
        }
        exports.DataRowMessage = DataRowMessage;
        class NoticeMessage {
          constructor(length, message) {
            this.length = length;
            this.message = message;
            this.name = 'notice';
          }
        }
        exports.NoticeMessage = NoticeMessage;
        //# sourceMappingURL=messages.js.map

        /***/
}),

/***/ 4756:
/***/ ((module) => {

        "use strict";
        module.exports = require("tls");

        /***/
}),

/***/ 5026:
/***/ ((__unused_webpack_module, exports) => {

        "use strict";

        Object.defineProperty(exports, "__esModule", ({ value: true }));
        exports.BufferReader = void 0;
        const emptyBuffer = Buffer.allocUnsafe(0);
        class BufferReader {
          constructor(offset = 0) {
            this.offset = offset;
            this.buffer = emptyBuffer;
            // TODO(bmc): support non-utf8 encoding?
            this.encoding = 'utf-8';
          }
          setBuffer(offset, buffer) {
            this.offset = offset;
            this.buffer = buffer;
          }
          int16() {
            const result = this.buffer.readInt16BE(this.offset);
            this.offset += 2;
            return result;
          }
          byte() {
            const result = this.buffer[this.offset];
            this.offset++;
            return result;
          }
          int32() {
            const result = this.buffer.readInt32BE(this.offset);
            this.offset += 4;
            return result;
          }
          uint32() {
            const result = this.buffer.readUInt32BE(this.offset);
            this.offset += 4;
            return result;
          }
          string(length) {
            const result = this.buffer.toString(this.encoding, this.offset, this.offset + length);
            this.offset += length;
            return result;
          }
          cstring() {
            const start = this.offset;
            let end = start;
            // eslint-disable-next-line no-empty
            while (this.buffer[end++] !== 0) { }
            this.offset = end;
            return this.buffer.toString(this.encoding, start, end - 1);
          }
          bytes(length) {
            const result = this.buffer.slice(this.offset, this.offset + length);
            this.offset += length;
            return result;
          }
        }
        exports.BufferReader = BufferReader;
        //# sourceMappingURL=buffer-reader.js.map

        /***/
}),

/***/ 5190:
/***/ ((module) => {

        function x509Error(msg, cert) {
          return new Error('SASL channel binding: ' + msg + ' when parsing public certificate ' + cert.toString('base64'))
        }

        function readASN1Length(data, index) {
          let length = data[index++]
          if (length < 0x80) return { length, index }

          const lengthBytes = length & 0x7f
          if (lengthBytes > 4) throw x509Error('bad length', data)

          length = 0
          for (let i = 0; i < lengthBytes; i++) {
            length = (length << 8) | data[index++]
          }

          return { length, index }
        }

        function readASN1OID(data, index) {
          if (data[index++] !== 0x6) throw x509Error('non-OID data', data) // 6 = OID

          const { length: OIDLength, index: indexAfterOIDLength } = readASN1Length(data, index)
          index = indexAfterOIDLength
          const lastIndex = index + OIDLength

          const byte1 = data[index++]
          let oid = ((byte1 / 40) >> 0) + '.' + (byte1 % 40)

          while (index < lastIndex) {
            // loop over numbers in OID
            let value = 0
            while (index < lastIndex) {
              // loop over bytes in number
              const nextByte = data[index++]
              value = (value << 7) | (nextByte & 0x7f)
              if (nextByte < 0x80) break
            }
            oid += '.' + value
          }

          return { oid, index }
        }

        function expectASN1Seq(data, index) {
          if (data[index++] !== 0x30) throw x509Error('non-sequence data', data) // 30 = Sequence
          return readASN1Length(data, index)
        }

        function signatureAlgorithmHashFromCertificate(data, index) {
          // read this thread: https://www.postgresql.org/message-id/17760-b6c61e752ec07060%40postgresql.org
          if (index === undefined) index = 0
          index = expectASN1Seq(data, index).index
          const { length: certInfoLength, index: indexAfterCertInfoLength } = expectASN1Seq(data, index)
          index = indexAfterCertInfoLength + certInfoLength // skip over certificate info
          index = expectASN1Seq(data, index).index // skip over signature length field
          const { oid, index: indexAfterOID } = readASN1OID(data, index)
          switch (oid) {
            // RSA
            case '1.2.840.113549.1.1.4':
              return 'MD5'
            case '1.2.840.113549.1.1.5':
              return 'SHA-1'
            case '1.2.840.113549.1.1.11':
              return 'SHA-256'
            case '1.2.840.113549.1.1.12':
              return 'SHA-384'
            case '1.2.840.113549.1.1.13':
              return 'SHA-512'
            case '1.2.840.113549.1.1.14':
              return 'SHA-224'
            case '1.2.840.113549.1.1.15':
              return 'SHA512-224'
            case '1.2.840.113549.1.1.16':
              return 'SHA512-256'
            // ECDSA
            case '1.2.840.10045.4.1':
              return 'SHA-1'
            case '1.2.840.10045.4.3.1':
              return 'SHA-224'
            case '1.2.840.10045.4.3.2':
              return 'SHA-256'
            case '1.2.840.10045.4.3.3':
              return 'SHA-384'
            case '1.2.840.10045.4.3.4':
              return 'SHA-512'
            // RSASSA-PSS: hash is indicated separately
            case '1.2.840.113549.1.1.10': {
              index = indexAfterOID
              index = expectASN1Seq(data, index).index
              if (data[index++] !== 0xa0) throw x509Error('non-tag data', data) // a0 = constructed tag 0
              index = readASN1Length(data, index).index // skip over tag length field
              index = expectASN1Seq(data, index).index // skip over sequence length field
              const { oid: hashOID } = readASN1OID(data, index)
              switch (hashOID) {
                // standalone hash OIDs
                case '1.2.840.113549.2.5':
                  return 'MD5'
                case '1.3.14.3.2.26':
                  return 'SHA-1'
                case '2.16.840.1.101.3.4.2.1':
                  return 'SHA-256'
                case '2.16.840.1.101.3.4.2.2':
                  return 'SHA-384'
                case '2.16.840.1.101.3.4.2.3':
                  return 'SHA-512'
              }
              throw x509Error('unknown hash OID ' + hashOID, data)
            }
            // Ed25519 -- see https: return//github.com/openssl/openssl/issues/15477
            case '1.3.101.110':
            case '1.3.101.112': // ph
              return 'SHA-512'
            // Ed448 -- still not in pg 17.2 (if supported, digest would be SHAKE256 x 64 bytes)
            case '1.3.101.111':
            case '1.3.101.113': // ph
              throw x509Error('Ed448 certificate channel binding is not currently supported by Postgres')
          }
          throw x509Error('unknown OID ' + oid, data)
        }

        module.exports = { signatureAlgorithmHashFromCertificate }


        /***/
}),

/***/ 5202:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        const { getStream, getSecureStream } = getStreamFuncs()

        module.exports = {
          /**
           * Get a socket stream compatible with the current runtime environment.
           * @returns {Duplex}
           */
          getStream,
          /**
           * Get a TLS secured socket, compatible with the current environment,
           * using the socket and other settings given in `options`.
           * @returns {Duplex}
           */
          getSecureStream,
        }

        /**
         * The stream functions that work in Node.js
         */
        function getNodejsStreamFuncs() {
          function getStream(ssl) {
            const net = __webpack_require__(9278)
            return new net.Socket()
          }

          function getSecureStream(options) {
            const tls = __webpack_require__(4756)
            return tls.connect(options)
          }
          return {
            getStream,
            getSecureStream,
          }
        }

        /**
         * The stream functions that work in Cloudflare Workers
         */
        function getCloudflareStreamFuncs() {
          function getStream(ssl) {
            const { CloudflareSocket } = __webpack_require__(3780)
            return new CloudflareSocket(ssl)
          }

          function getSecureStream(options) {
            options.socket.startTls(options)
            return options.socket
          }
          return {
            getStream,
            getSecureStream,
          }
        }

        /**
         * Are we running in a Cloudflare Worker?
         *
         * @returns true if the code is currently running inside a Cloudflare Worker.
         */
        function isCloudflareRuntime() {
          // Since 2022-03-21 the `global_navigator` compatibility flag is on for Cloudflare Workers
          // which means that `navigator.userAgent` will be defined.
          // eslint-disable-next-line no-undef
          if (typeof navigator === 'object' && navigator !== null && typeof navigator.userAgent === 'string') {
            // eslint-disable-next-line no-undef
            return navigator.userAgent === 'Cloudflare-Workers'
          }
          // In case `navigator` or `navigator.userAgent` is not defined then try a more sneaky approach
          if (typeof Response === 'function') {
            const resp = new Response(null, { cf: { thing: true } })
            if (typeof resp.cf === 'object' && resp.cf !== null && resp.cf.thing) {
              return true
            }
          }
          return false
        }

        function getStreamFuncs() {
          if (isCloudflareRuntime()) {
            return getCloudflareStreamFuncs()
          }
          return getNodejsStreamFuncs()
        }


        /***/
}),

/***/ 5252:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

        "use strict";

        Object.defineProperty(exports, "__esModule", ({ value: true }));
        exports.DatabaseError = exports.serialize = exports.parse = void 0;
        const messages_1 = __webpack_require__(4618);
        Object.defineProperty(exports, "DatabaseError", ({ enumerable: true, get: function () { return messages_1.DatabaseError; } }));
        const serializer_1 = __webpack_require__(7190);
        Object.defineProperty(exports, "serialize", ({ enumerable: true, get: function () { return serializer_1.serialize; } }));
        const parser_1 = __webpack_require__(2625);
        function parse(stream, callback) {
          const parser = new parser_1.Parser();
          stream.on('data', (buffer) => parser.parse(buffer, callback));
          return new Promise((resolve) => stream.on('end', () => resolve()));
        }
        exports.parse = parse;
        //# sourceMappingURL=index.js.map

        /***/
}),

/***/ 5489:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        var path = __webpack_require__(6928)
          , fs = __webpack_require__(9896)
          , helper = __webpack_require__(6361)
          ;


        module.exports = function (connInfo, cb) {
          var file = helper.getFileName();

          fs.stat(file, function (err, stat) {
            if (err || !helper.usePgPass(stat, file)) {
              return cb(undefined);
            }

            var st = fs.createReadStream(file);

            helper.getPassword(connInfo, st, cb);
          });
        };

        module.exports.warnTo = helper.warnTo;


        /***/
}),

/***/ 5956:
/***/ ((module) => {

        module.exports = extend

        var hasOwnProperty = Object.prototype.hasOwnProperty;

        function extend(target) {
          for (var i = 1; i < arguments.length; i++) {
            var source = arguments[i]

            for (var key in source) {
              if (hasOwnProperty.call(source, key)) {
                target[key] = source[key]
              }
            }
          }

          return target
        }


        /***/
}),

/***/ 6331:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        const dns = __webpack_require__(2250)

        const defaults = __webpack_require__(6864)

        const parse = (__webpack_require__(6483).parse) // parses a connection string

        const val = function (key, config, envVar) {
          if (envVar === undefined) {
            envVar = process.env['PG' + key.toUpperCase()]
          } else if (envVar === false) {
            // do nothing ... use false
          } else {
            envVar = process.env[envVar]
          }

          return config[key] || envVar || defaults[key]
        }

        const readSSLConfigFromEnvironment = function () {
          switch (process.env.PGSSLMODE) {
            case 'disable':
              return false
            case 'prefer':
            case 'require':
            case 'verify-ca':
            case 'verify-full':
              return true
            case 'no-verify':
              return { rejectUnauthorized: false }
          }
          return defaults.ssl
        }

        // Convert arg to a string, surround in single quotes, and escape single quotes and backslashes
        const quoteParamValue = function (value) {
          return "'" + ('' + value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
        }

        const add = function (params, config, paramName) {
          const value = config[paramName]
          if (value !== undefined && value !== null) {
            params.push(paramName + '=' + quoteParamValue(value))
          }
        }

        class ConnectionParameters {
          constructor(config) {
            // if a string is passed, it is a raw connection string so we parse it into a config
            config = typeof config === 'string' ? parse(config) : config || {}

            // if the config has a connectionString defined, parse IT into the config we use
            // this will override other default values with what is stored in connectionString
            if (config.connectionString) {
              config = Object.assign({}, config, parse(config.connectionString))
            }

            this.user = val('user', config)
            this.database = val('database', config)

            if (this.database === undefined) {
              this.database = this.user
            }

            this.port = parseInt(val('port', config), 10)
            this.host = val('host', config)

            // "hiding" the password so it doesn't show up in stack traces
            // or if the client is console.logged
            Object.defineProperty(this, 'password', {
              configurable: true,
              enumerable: false,
              writable: true,
              value: val('password', config),
            })

            this.binary = val('binary', config)
            this.options = val('options', config)

            this.ssl = typeof config.ssl === 'undefined' ? readSSLConfigFromEnvironment() : config.ssl

            if (typeof this.ssl === 'string') {
              if (this.ssl === 'true') {
                this.ssl = true
              }
            }
            // support passing in ssl=no-verify via connection string
            if (this.ssl === 'no-verify') {
              this.ssl = { rejectUnauthorized: false }
            }
            if (this.ssl && this.ssl.key) {
              Object.defineProperty(this.ssl, 'key', {
                enumerable: false,
              })
            }

            this.client_encoding = val('client_encoding', config)
            this.replication = val('replication', config)
            // a domain socket begins with '/'
            this.isDomainSocket = !(this.host || '').indexOf('/')

            this.application_name = val('application_name', config, 'PGAPPNAME')
            this.fallback_application_name = val('fallback_application_name', config, false)
            this.statement_timeout = val('statement_timeout', config, false)
            this.lock_timeout = val('lock_timeout', config, false)
            this.idle_in_transaction_session_timeout = val('idle_in_transaction_session_timeout', config, false)
            this.query_timeout = val('query_timeout', config, false)

            if (config.connectionTimeoutMillis === undefined) {
              this.connect_timeout = process.env.PGCONNECT_TIMEOUT || 0
            } else {
              this.connect_timeout = Math.floor(config.connectionTimeoutMillis / 1000)
            }

            if (config.keepAlive === false) {
              this.keepalives = 0
            } else if (config.keepAlive === true) {
              this.keepalives = 1
            }

            if (typeof config.keepAliveInitialDelayMillis === 'number') {
              this.keepalives_idle = Math.floor(config.keepAliveInitialDelayMillis / 1000)
            }
          }

          getLibpqConnectionString(cb) {
            const params = []
            add(params, this, 'user')
            add(params, this, 'password')
            add(params, this, 'port')
            add(params, this, 'application_name')
            add(params, this, 'fallback_application_name')
            add(params, this, 'connect_timeout')
            add(params, this, 'options')

            const ssl = typeof this.ssl === 'object' ? this.ssl : this.ssl ? { sslmode: this.ssl } : {}
            add(params, ssl, 'sslmode')
            add(params, ssl, 'sslca')
            add(params, ssl, 'sslkey')
            add(params, ssl, 'sslcert')
            add(params, ssl, 'sslrootcert')

            if (this.database) {
              params.push('dbname=' + quoteParamValue(this.database))
            }
            if (this.replication) {
              params.push('replication=' + quoteParamValue(this.replication))
            }
            if (this.host) {
              params.push('host=' + quoteParamValue(this.host))
            }
            if (this.isDomainSocket) {
              return cb(null, params.join(' '))
            }
            if (this.client_encoding) {
              params.push('client_encoding=' + quoteParamValue(this.client_encoding))
            }
            dns.lookup(this.host, function (err, address) {
              if (err) return cb(err, null)
              params.push('hostaddr=' + quoteParamValue(address))
              return cb(null, params.join(' '))
            })
          }
        }

        module.exports = ConnectionParameters


        /***/
}),

/***/ 6361:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        var path = __webpack_require__(6928)
          , Stream = (__webpack_require__(2203).Stream)
          , split = __webpack_require__(4615)
          , util = __webpack_require__(9023)
          , defaultPort = 5432
          , isWin = (process.platform === 'win32')
          , warnStream = process.stderr
          ;


        var S_IRWXG = 56     //    00070(8)
          , S_IRWXO = 7      //    00007(8)
          , S_IFMT = 61440  // 00170000(8)
          , S_IFREG = 32768  //  0100000(8)
          ;
        function isRegFile(mode) {
          return ((mode & S_IFMT) == S_IFREG);
        }

        var fieldNames = ['host', 'port', 'database', 'user', 'password'];
        var nrOfFields = fieldNames.length;
        var passKey = fieldNames[nrOfFields - 1];


        function warn() {
          var isWritable = (
            warnStream instanceof Stream &&
            true === warnStream.writable
          );

          if (isWritable) {
            var args = Array.prototype.slice.call(arguments).concat("\n");
            warnStream.write(util.format.apply(util, args));
          }
        }


        Object.defineProperty(module.exports, "isWin", ({
          get: function () {
            return isWin;
          },
          set: function (val) {
            isWin = val;
          }
        }));


        module.exports.warnTo = function (stream) {
          var old = warnStream;
          warnStream = stream;
          return old;
        };

        module.exports.getFileName = function (rawEnv) {
          var env = rawEnv || process.env;
          var file = env.PGPASSFILE || (
            isWin ?
              path.join(env.APPDATA || './', 'postgresql', 'pgpass.conf') :
              path.join(env.HOME || './', '.pgpass')
          );
          return file;
        };

        module.exports.usePgPass = function (stats, fname) {
          if (Object.prototype.hasOwnProperty.call(process.env, 'PGPASSWORD')) {
            return false;
          }

          if (isWin) {
            return true;
          }

          fname = fname || '<unkn>';

          if (!isRegFile(stats.mode)) {
            warn('WARNING: password file "%s" is not a plain file', fname);
            return false;
          }

          if (stats.mode & (S_IRWXG | S_IRWXO)) {
            /* If password file is insecure, alert the user and ignore it. */
            warn('WARNING: password file "%s" has group or world access; permissions should be u=rw (0600) or less', fname);
            return false;
          }

          return true;
        };


        var matcher = module.exports.match = function (connInfo, entry) {
          return fieldNames.slice(0, -1).reduce(function (prev, field, idx) {
            if (idx == 1) {
              // the port
              if (Number(connInfo[field] || defaultPort) === Number(entry[field])) {
                return prev && true;
              }
            }
            return prev && (
              entry[field] === '*' ||
              entry[field] === connInfo[field]
            );
          }, true);
        };


        module.exports.getPassword = function (connInfo, stream, cb) {
          var pass;
          var lineStream = stream.pipe(split());

          function onLine(line) {
            var entry = parseLine(line);
            if (entry && isValidEntry(entry) && matcher(connInfo, entry)) {
              pass = entry[passKey];
              lineStream.end(); // -> calls onEnd(), but pass is set now
            }
          }

          var onEnd = function () {
            stream.destroy();
            cb(pass);
          };

          var onErr = function (err) {
            stream.destroy();
            warn('WARNING: error on reading file: %s', err);
            cb(undefined);
          };

          stream.on('error', onErr);
          lineStream
            .on('data', onLine)
            .on('end', onEnd)
            .on('error', onErr)
            ;

        };


        var parseLine = module.exports.parseLine = function (line) {
          if (line.length < 11 || line.match(/^\s+#/)) {
            return null;
          }

          var curChar = '';
          var prevChar = '';
          var fieldIdx = 0;
          var startIdx = 0;
          var endIdx = 0;
          var obj = {};
          var isLastField = false;
          var addToObj = function (idx, i0, i1) {
            var field = line.substring(i0, i1);

            if (!Object.hasOwnProperty.call(process.env, 'PGPASS_NO_DEESCAPE')) {
              field = field.replace(/\\([:\\])/g, '$1');
            }

            obj[fieldNames[idx]] = field;
          };

          for (var i = 0; i < line.length - 1; i += 1) {
            curChar = line.charAt(i + 1);
            prevChar = line.charAt(i);

            isLastField = (fieldIdx == nrOfFields - 1);

            if (isLastField) {
              addToObj(fieldIdx, startIdx);
              break;
            }

            if (i >= 0 && curChar == ':' && prevChar !== '\\') {
              addToObj(fieldIdx, startIdx, i + 1);

              startIdx = i + 2;
              fieldIdx += 1;
            }
          }

          obj = (Object.keys(obj).length === nrOfFields) ? obj : null;

          return obj;
        };


        var isValidEntry = module.exports.isValidEntry = function (entry) {
          var rules = {
            // host
            0: function (x) {
              return x.length > 0;
            },
            // port
            1: function (x) {
              if (x === '*') {
                return true;
              }
              x = Number(x);
              return (
                isFinite(x) &&
                x > 0 &&
                x < 9007199254740992 &&
                Math.floor(x) === x
              );
            },
            // database
            2: function (x) {
              return x.length > 0;
            },
            // username
            3: function (x) {
              return x.length > 0;
            },
            // password
            4: function (x) {
              return x.length > 0;
            }
          };

          for (var idx = 0; idx < fieldNames.length; idx += 1) {
            var rule = rules[idx];
            var value = entry[fieldNames[idx]] || '';

            var res = rule(value);
            if (!res) {
              return false;
            }
          }

          return true;
        };



        /***/
}),

/***/ 6483:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        //Parse method copied from https://github.com/brianc/node-postgres
        //Copyright (c) 2010-2014 Brian Carlson (brian.m.carlson@gmail.com)
        //MIT License

        //parses a connection string
        function parse(str, options = {}) {
          //unix socket
          if (str.charAt(0) === '/') {
            const config = str.split(' ')
            return { host: config[0], database: config[1] }
          }

          // Check for empty host in URL

          const config = {}
          let result
          let dummyHost = false
          if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(str)) {
            // Ensure spaces are encoded as %20
            str = encodeURI(str).replace(/%25(\d\d)/g, '%$1')
          }

          try {
            try {
              result = new URL(str, 'postgres://base')
            } catch (e) {
              // The URL is invalid so try again with a dummy host
              result = new URL(str.replace('@/', '@___DUMMY___/'), 'postgres://base')
              dummyHost = true
            }
          } catch (err) {
            // Remove the input from the error message to avoid leaking sensitive information
            err.input && (err.input = '*****REDACTED*****')
          }

          // We'd like to use Object.fromEntries() here but Node.js 10 does not support it
          for (const entry of result.searchParams.entries()) {
            config[entry[0]] = entry[1]
          }

          config.user = config.user || decodeURIComponent(result.username)
          config.password = config.password || decodeURIComponent(result.password)

          if (result.protocol == 'socket:') {
            config.host = decodeURI(result.pathname)
            config.database = result.searchParams.get('db')
            config.client_encoding = result.searchParams.get('encoding')
            return config
          }
          const hostname = dummyHost ? '' : result.hostname
          if (!config.host) {
            // Only set the host if there is no equivalent query param.
            config.host = decodeURIComponent(hostname)
          } else if (hostname && /^%2f/i.test(hostname)) {
            // Only prepend the hostname to the pathname if it is not a URL encoded Unix socket host.
            result.pathname = hostname + result.pathname
          }
          if (!config.port) {
            // Only set the port if there is no equivalent query param.
            config.port = result.port
          }

          const pathname = result.pathname.slice(1) || null
          config.database = pathname ? decodeURI(pathname) : null

          if (config.ssl === 'true' || config.ssl === '1') {
            config.ssl = true
          }

          if (config.ssl === '0') {
            config.ssl = false
          }

          if (config.sslcert || config.sslkey || config.sslrootcert || config.sslmode) {
            config.ssl = {}
          }

          // Only try to load fs if we expect to read from the disk
          const fs = config.sslcert || config.sslkey || config.sslrootcert ? __webpack_require__(9896) : null

          if (config.sslcert) {
            config.ssl.cert = fs.readFileSync(config.sslcert).toString()
          }

          if (config.sslkey) {
            config.ssl.key = fs.readFileSync(config.sslkey).toString()
          }

          if (config.sslrootcert) {
            config.ssl.ca = fs.readFileSync(config.sslrootcert).toString()
          }

          if (options.useLibpqCompat && config.uselibpqcompat) {
            throw new Error('Both useLibpqCompat and uselibpqcompat are set. Please use only one of them.')
          }

          if (config.uselibpqcompat === 'true' || options.useLibpqCompat) {
            switch (config.sslmode) {
              case 'disable': {
                config.ssl = false
                break
              }
              case 'prefer': {
                config.ssl.rejectUnauthorized = false
                break
              }
              case 'require': {
                if (config.sslrootcert) {
                  // If a root CA is specified, behavior of `sslmode=require` will be the same as that of `verify-ca`
                  config.ssl.checkServerIdentity = function () { }
                } else {
                  config.ssl.rejectUnauthorized = false
                }
                break
              }
              case 'verify-ca': {
                if (!config.ssl.ca) {
                  throw new Error(
                    'SECURITY WARNING: Using sslmode=verify-ca requires specifying a CA with sslrootcert. If a public CA is used, verify-ca allows connections to a server that somebody else may have registered with the CA, making you vulnerable to Man-in-the-Middle attacks. Either specify a custom CA certificate with sslrootcert parameter or use sslmode=verify-full for proper security.'
                  )
                }
                config.ssl.checkServerIdentity = function () { }
                break
              }
              case 'verify-full': {
                break
              }
            }
          } else {
            switch (config.sslmode) {
              case 'disable': {
                config.ssl = false
                break
              }
              case 'prefer':
              case 'require':
              case 'verify-ca':
              case 'verify-full': {
                break
              }
              case 'no-verify': {
                config.ssl.rejectUnauthorized = false
                break
              }
            }
          }

          return config
        }

        // convert pg-connection-string ssl config to a ClientConfig.ConnectionOptions
        function toConnectionOptions(sslConfig) {
          const connectionOptions = Object.entries(sslConfig).reduce((c, [key, value]) => {
            // we explicitly check for undefined and null instead of `if (value)` because some
            // options accept falsy values. Example: `ssl.rejectUnauthorized = false`
            if (value !== undefined && value !== null) {
              c[key] = value
            }

            return c
          }, {})

          return connectionOptions
        }

        // convert pg-connection-string config to a ClientConfig
        function toClientConfig(config) {
          const poolConfig = Object.entries(config).reduce((c, [key, value]) => {
            if (key === 'ssl') {
              const sslConfig = value

              if (typeof sslConfig === 'boolean') {
                c[key] = sslConfig
              }

              if (typeof sslConfig === 'object') {
                c[key] = toConnectionOptions(sslConfig)
              }
            } else if (value !== undefined && value !== null) {
              if (key === 'port') {
                // when port is not specified, it is converted into an empty string
                // we want to avoid NaN or empty string as a values in ClientConfig
                if (value !== '') {
                  const v = parseInt(value, 10)
                  if (isNaN(v)) {
                    throw new Error(`Invalid ${key}: ${value}`)
                  }

                  c[key] = v
                }
              } else {
                c[key] = value
              }
            }

            return c
          }, {})

          return poolConfig
        }

        // parses a connection string into ClientConfig
        function parseIntoClientConfig(str) {
          return toClientConfig(parse(str))
        }

        module.exports = parse

        parse.parse = parse
        parse.toClientConfig = toClientConfig
        parse.parseIntoClientConfig = parseIntoClientConfig


        /***/
}),

/***/ 6594:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        const EventEmitter = (__webpack_require__(4434).EventEmitter)
        const util = __webpack_require__(9023)
        const utils = __webpack_require__(2341)

        const NativeQuery = (module.exports = function (config, values, callback) {
          EventEmitter.call(this)
          config = utils.normalizeQueryConfig(config, values, callback)
          this.text = config.text
          this.values = config.values
          this.name = config.name
          this.queryMode = config.queryMode
          this.callback = config.callback
          this.state = 'new'
          this._arrayMode = config.rowMode === 'array'

          // if the 'row' event is listened for
          // then emit them as they come in
          // without setting singleRowMode to true
          // this has almost no meaning because libpq
          // reads all rows into memory before returning any
          this._emitRowEvents = false
          this.on(
            'newListener',
            function (event) {
              if (event === 'row') this._emitRowEvents = true
            }.bind(this)
          )
        })

        util.inherits(NativeQuery, EventEmitter)

        const errorFieldMap = {
          sqlState: 'code',
          statementPosition: 'position',
          messagePrimary: 'message',
          context: 'where',
          schemaName: 'schema',
          tableName: 'table',
          columnName: 'column',
          dataTypeName: 'dataType',
          constraintName: 'constraint',
          sourceFile: 'file',
          sourceLine: 'line',
          sourceFunction: 'routine',
        }

        NativeQuery.prototype.handleError = function (err) {
          // copy pq error fields into the error object
          const fields = this.native.pq.resultErrorFields()
          if (fields) {
            for (const key in fields) {
              const normalizedFieldName = errorFieldMap[key] || key
              err[normalizedFieldName] = fields[key]
            }
          }
          if (this.callback) {
            this.callback(err)
          } else {
            this.emit('error', err)
          }
          this.state = 'error'
        }

        NativeQuery.prototype.then = function (onSuccess, onFailure) {
          return this._getPromise().then(onSuccess, onFailure)
        }

        NativeQuery.prototype.catch = function (callback) {
          return this._getPromise().catch(callback)
        }

        NativeQuery.prototype._getPromise = function () {
          if (this._promise) return this._promise
          this._promise = new Promise(
            function (resolve, reject) {
              this._once('end', resolve)
              this._once('error', reject)
            }.bind(this)
          )
          return this._promise
        }

        NativeQuery.prototype.submit = function (client) {
          this.state = 'running'
          const self = this
          this.native = client.native
          client.native.arrayMode = this._arrayMode

          let after = function (err, rows, results) {
            client.native.arrayMode = false
            setImmediate(function () {
              self.emit('_done')
            })

            // handle possible query error
            if (err) {
              return self.handleError(err)
            }

            // emit row events for each row in the result
            if (self._emitRowEvents) {
              if (results.length > 1) {
                rows.forEach((rowOfRows, i) => {
                  rowOfRows.forEach((row) => {
                    self.emit('row', row, results[i])
                  })
                })
              } else {
                rows.forEach(function (row) {
                  self.emit('row', row, results)
                })
              }
            }

            // handle successful result
            self.state = 'end'
            self.emit('end', results)
            if (self.callback) {
              self.callback(null, results)
            }
          }

          if (process.domain) {
            after = process.domain.bind(after)
          }

          // named query
          if (this.name) {
            if (this.name.length > 63) {
              console.error('Warning! Postgres only supports 63 characters for query names.')
              console.error('You supplied %s (%s)', this.name, this.name.length)
              console.error('This can cause conflicts and silent errors executing queries')
            }
            const values = (this.values || []).map(utils.prepareValue)

            // check if the client has already executed this named query
            // if so...just execute it again - skip the planning phase
            if (client.namedQueries[this.name]) {
              if (this.text && client.namedQueries[this.name] !== this.text) {
                const err = new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`)
                return after(err)
              }
              return client.native.execute(this.name, values, after)
            }
            // plan the named query the first time, then execute it
            return client.native.prepare(this.name, this.text, values.length, function (err) {
              if (err) return after(err)
              client.namedQueries[self.name] = self.text
              return self.native.execute(self.name, values, after)
            })
          } else if (this.values) {
            if (!Array.isArray(this.values)) {
              const err = new Error('Query values must be an array')
              return after(err)
            }
            const vals = this.values.map(utils.prepareValue)
            client.native.query(this.text, vals, after)
          } else if (this.queryMode === 'extended') {
            client.native.query(this.text, [], after)
          } else {
            client.native.query(this.text, after)
          }
        }


        /***/
}),

/***/ 6606:
/***/ ((__unused_webpack_module, exports) => {

        "use strict";


        exports.parse = function (source, transform) {
          return new ArrayParser(source, transform).parse()
        }

        class ArrayParser {
          constructor(source, transform) {
            this.source = source
            this.transform = transform || identity
            this.position = 0
            this.entries = []
            this.recorded = []
            this.dimension = 0
          }

          isEof() {
            return this.position >= this.source.length
          }

          nextCharacter() {
            var character = this.source[this.position++]
            if (character === '\\') {
              return {
                value: this.source[this.position++],
                escaped: true
              }
            }
            return {
              value: character,
              escaped: false
            }
          }

          record(character) {
            this.recorded.push(character)
          }

          newEntry(includeEmpty) {
            var entry
            if (this.recorded.length > 0 || includeEmpty) {
              entry = this.recorded.join('')
              if (entry === 'NULL' && !includeEmpty) {
                entry = null
              }
              if (entry !== null) entry = this.transform(entry)
              this.entries.push(entry)
              this.recorded = []
            }
          }

          consumeDimensions() {
            if (this.source[0] === '[') {
              while (!this.isEof()) {
                var char = this.nextCharacter()
                if (char.value === '=') break
              }
            }
          }

          parse(nested) {
            var character, parser, quote
            this.consumeDimensions()
            while (!this.isEof()) {
              character = this.nextCharacter()
              if (character.value === '{' && !quote) {
                this.dimension++
                if (this.dimension > 1) {
                  parser = new ArrayParser(this.source.substr(this.position - 1), this.transform)
                  this.entries.push(parser.parse(true))
                  this.position += parser.position - 2
                }
              } else if (character.value === '}' && !quote) {
                this.dimension--
                if (!this.dimension) {
                  this.newEntry()
                  if (nested) return this.entries
                }
              } else if (character.value === '"' && !character.escaped) {
                if (quote) this.newEntry(true)
                quote = !quote
              } else if (character.value === ',' && !quote) {
                this.newEntry()
              } else {
                this.record(character.value)
              }
            }
            if (this.dimension !== 0) {
              throw new Error('array dimension not balanced')
            }
            return this.entries
          }
        }

        function identity(value) {
          return value
        }


        /***/
}),

/***/ 6709:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";

        const crypto = __webpack_require__(8221)
        const { signatureAlgorithmHashFromCertificate } = __webpack_require__(5190)

        function startSession(mechanisms, stream) {
          const candidates = ['SCRAM-SHA-256']
          if (stream) candidates.unshift('SCRAM-SHA-256-PLUS') // higher-priority, so placed first

          const mechanism = candidates.find((candidate) => mechanisms.includes(candidate))

          if (!mechanism) {
            throw new Error('SASL: Only mechanism(s) ' + candidates.join(' and ') + ' are supported')
          }

          if (mechanism === 'SCRAM-SHA-256-PLUS' && typeof stream.getPeerCertificate !== 'function') {
            // this should never happen if we are really talking to a Postgres server
            throw new Error('SASL: Mechanism SCRAM-SHA-256-PLUS requires a certificate')
          }

          const clientNonce = crypto.randomBytes(18).toString('base64')
          const gs2Header = mechanism === 'SCRAM-SHA-256-PLUS' ? 'p=tls-server-end-point' : stream ? 'y' : 'n'

          return {
            mechanism,
            clientNonce,
            response: gs2Header + ',,n=*,r=' + clientNonce,
            message: 'SASLInitialResponse',
          }
        }

        async function continueSession(session, password, serverData, stream) {
          if (session.message !== 'SASLInitialResponse') {
            throw new Error('SASL: Last message was not SASLInitialResponse')
          }
          if (typeof password !== 'string') {
            throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string')
          }
          if (password === '') {
            throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string')
          }
          if (typeof serverData !== 'string') {
            throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: serverData must be a string')
          }

          const sv = parseServerFirstMessage(serverData)

          if (!sv.nonce.startsWith(session.clientNonce)) {
            throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce')
          } else if (sv.nonce.length === session.clientNonce.length) {
            throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce is too short')
          }

          const clientFirstMessageBare = 'n=*,r=' + session.clientNonce
          const serverFirstMessage = 'r=' + sv.nonce + ',s=' + sv.salt + ',i=' + sv.iteration

          // without channel binding:
          let channelBinding = stream ? 'eSws' : 'biws' // 'y,,' or 'n,,', base64-encoded

          // override if channel binding is in use:
          if (session.mechanism === 'SCRAM-SHA-256-PLUS') {
            const peerCert = stream.getPeerCertificate().raw
            let hashName = signatureAlgorithmHashFromCertificate(peerCert)
            if (hashName === 'MD5' || hashName === 'SHA-1') hashName = 'SHA-256'
            const certHash = await crypto.hashByName(hashName, peerCert)
            const bindingData = Buffer.concat([Buffer.from('p=tls-server-end-point,,'), Buffer.from(certHash)])
            channelBinding = bindingData.toString('base64')
          }

          const clientFinalMessageWithoutProof = 'c=' + channelBinding + ',r=' + sv.nonce
          const authMessage = clientFirstMessageBare + ',' + serverFirstMessage + ',' + clientFinalMessageWithoutProof

          const saltBytes = Buffer.from(sv.salt, 'base64')
          const saltedPassword = await crypto.deriveKey(password, saltBytes, sv.iteration)
          const clientKey = await crypto.hmacSha256(saltedPassword, 'Client Key')
          const storedKey = await crypto.sha256(clientKey)
          const clientSignature = await crypto.hmacSha256(storedKey, authMessage)
          const clientProof = xorBuffers(Buffer.from(clientKey), Buffer.from(clientSignature)).toString('base64')
          const serverKey = await crypto.hmacSha256(saltedPassword, 'Server Key')
          const serverSignatureBytes = await crypto.hmacSha256(serverKey, authMessage)

          session.message = 'SASLResponse'
          session.serverSignature = Buffer.from(serverSignatureBytes).toString('base64')
          session.response = clientFinalMessageWithoutProof + ',p=' + clientProof
        }

        function finalizeSession(session, serverData) {
          if (session.message !== 'SASLResponse') {
            throw new Error('SASL: Last message was not SASLResponse')
          }
          if (typeof serverData !== 'string') {
            throw new Error('SASL: SCRAM-SERVER-FINAL-MESSAGE: serverData must be a string')
          }

          const { serverSignature } = parseServerFinalMessage(serverData)

          if (serverSignature !== session.serverSignature) {
            throw new Error('SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match')
          }
        }

        /**
         * printable       = %x21-2B / %x2D-7E
         *                   ;; Printable ASCII except ",".
         *                   ;; Note that any "printable" is also
         *                   ;; a valid "value".
         */
        function isPrintableChars(text) {
          if (typeof text !== 'string') {
            throw new TypeError('SASL: text must be a string')
          }
          return text
            .split('')
            .map((_, i) => text.charCodeAt(i))
            .every((c) => (c >= 0x21 && c <= 0x2b) || (c >= 0x2d && c <= 0x7e))
        }

        /**
         * base64-char     = ALPHA / DIGIT / "/" / "+"
         *
         * base64-4        = 4base64-char
         *
         * base64-3        = 3base64-char "="
         *
         * base64-2        = 2base64-char "=="
         *
         * base64          = *base64-4 [base64-3 / base64-2]
         */
        function isBase64(text) {
          return /^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(text)
        }

        function parseAttributePairs(text) {
          if (typeof text !== 'string') {
            throw new TypeError('SASL: attribute pairs text must be a string')
          }

          return new Map(
            text.split(',').map((attrValue) => {
              if (!/^.=/.test(attrValue)) {
                throw new Error('SASL: Invalid attribute pair entry')
              }
              const name = attrValue[0]
              const value = attrValue.substring(2)
              return [name, value]
            })
          )
        }

        function parseServerFirstMessage(data) {
          const attrPairs = parseAttributePairs(data)

          const nonce = attrPairs.get('r')
          if (!nonce) {
            throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing')
          } else if (!isPrintableChars(nonce)) {
            throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce must only contain printable characters')
          }
          const salt = attrPairs.get('s')
          if (!salt) {
            throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing')
          } else if (!isBase64(salt)) {
            throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: salt must be base64')
          }
          const iterationText = attrPairs.get('i')
          if (!iterationText) {
            throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing')
          } else if (!/^[1-9][0-9]*$/.test(iterationText)) {
            throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: invalid iteration count')
          }
          const iteration = parseInt(iterationText, 10)

          return {
            nonce,
            salt,
            iteration,
          }
        }

        function parseServerFinalMessage(serverData) {
          const attrPairs = parseAttributePairs(serverData)
          const serverSignature = attrPairs.get('v')
          if (!serverSignature) {
            throw new Error('SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing')
          } else if (!isBase64(serverSignature)) {
            throw new Error('SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature must be base64')
          }
          return {
            serverSignature,
          }
        }

        function xorBuffers(a, b) {
          if (!Buffer.isBuffer(a)) {
            throw new TypeError('first argument must be a Buffer')
          }
          if (!Buffer.isBuffer(b)) {
            throw new TypeError('second argument must be a Buffer')
          }
          if (a.length !== b.length) {
            throw new Error('Buffer lengths must match')
          }
          if (a.length === 0) {
            throw new Error('Buffers cannot be empty')
          }
          return Buffer.from(a.map((_, i) => a[i] ^ b[i]))
        }

        module.exports = {
          startSession,
          continueSession,
          finalizeSession,
        }


        /***/
}),

/***/ 6864:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        module.exports = {
          // database host. defaults to localhost
          host: 'localhost',

          // database user's name
          user: process.platform === 'win32' ? process.env.USERNAME : process.env.USER,

          // name of database to connect
          database: undefined,

          // database user's password
          password: null,

          // a Postgres connection string to be used instead of setting individual connection items
          // NOTE:  Setting this value will cause it to override any other value (such as database or user) defined
          // in the defaults object.
          connectionString: undefined,

          // database port
          port: 5432,

          // number of rows to return at a time from a prepared statement's
          // portal. 0 will return all rows at once
          rows: 0,

          // binary result mode
          binary: false,

          // Connection pool options - see https://github.com/brianc/node-pg-pool

          // number of connections to use in connection pool
          // 0 will disable connection pooling
          max: 10,

          // max milliseconds a client can go unused before it is removed
          // from the pool and destroyed
          idleTimeoutMillis: 30000,

          client_encoding: '',

          ssl: false,

          application_name: undefined,

          fallback_application_name: undefined,

          options: undefined,

          parseInputDatesAsUTC: false,

          // max milliseconds any query using this connection will execute for before timing out in error.
          // false=unlimited
          statement_timeout: false,

          // Abort any statement that waits longer than the specified duration in milliseconds while attempting to acquire a lock.
          // false=unlimited
          lock_timeout: false,

          // Terminate any session with an open transaction that has been idle for longer than the specified duration in milliseconds
          // false=unlimited
          idle_in_transaction_session_timeout: false,

          // max milliseconds to wait for query to complete (client side)
          query_timeout: false,

          connect_timeout: 0,

          keepalives: 1,

          keepalives_idle: 0,
        }

        const pgTypes = __webpack_require__(3988)
        // save default parsers
        const parseBigInteger = pgTypes.getTypeParser(20, 'text')
        const parseBigIntegerArray = pgTypes.getTypeParser(1016, 'text')

        // parse int8 so you can get your count values as actual numbers
        module.exports.__defineSetter__('parseInt8', function (val) {
          pgTypes.setTypeParser(20, 'text', val ? pgTypes.getTypeParser(23, 'text') : parseBigInteger)
          pgTypes.setTypeParser(1016, 'text', val ? pgTypes.getTypeParser(1007, 'text') : parseBigIntegerArray)
        })


        /***/
}),

/***/ 6928:
/***/ ((module) => {

        "use strict";
        module.exports = require("path");

        /***/
}),

/***/ 6982:
/***/ ((module) => {

        "use strict";
        module.exports = require("crypto");

        /***/
}),

/***/ 7077:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        const EventEmitter = (__webpack_require__(4434).EventEmitter)
        const utils = __webpack_require__(2341)
        const sasl = __webpack_require__(6709)
        const TypeOverrides = __webpack_require__(8686)

        const ConnectionParameters = __webpack_require__(6331)
        const Query = __webpack_require__(3556)
        const defaults = __webpack_require__(6864)
        const Connection = __webpack_require__(8046)
        const crypto = __webpack_require__(8221)

        class Client extends EventEmitter {
          constructor(config) {
            super()

            this.connectionParameters = new ConnectionParameters(config)
            this.user = this.connectionParameters.user
            this.database = this.connectionParameters.database
            this.port = this.connectionParameters.port
            this.host = this.connectionParameters.host

            // "hiding" the password so it doesn't show up in stack traces
            // or if the client is console.logged
            Object.defineProperty(this, 'password', {
              configurable: true,
              enumerable: false,
              writable: true,
              value: this.connectionParameters.password,
            })

            this.replication = this.connectionParameters.replication

            const c = config || {}

            this._Promise = c.Promise || global.Promise
            this._types = new TypeOverrides(c.types)
            this._ending = false
            this._ended = false
            this._connecting = false
            this._connected = false
            this._connectionError = false
            this._queryable = true

            this.enableChannelBinding = Boolean(c.enableChannelBinding) // set true to use SCRAM-SHA-256-PLUS when offered
            this.connection =
              c.connection ||
              new Connection({
                stream: c.stream,
                ssl: this.connectionParameters.ssl,
                keepAlive: c.keepAlive || false,
                keepAliveInitialDelayMillis: c.keepAliveInitialDelayMillis || 0,
                encoding: this.connectionParameters.client_encoding || 'utf8',
              })
            this.queryQueue = []
            this.binary = c.binary || defaults.binary
            this.processID = null
            this.secretKey = null
            this.ssl = this.connectionParameters.ssl || false
            // As with Password, make SSL->Key (the private key) non-enumerable.
            // It won't show up in stack traces
            // or if the client is console.logged
            if (this.ssl && this.ssl.key) {
              Object.defineProperty(this.ssl, 'key', {
                enumerable: false,
              })
            }

            this._connectionTimeoutMillis = c.connectionTimeoutMillis || 0
          }

          _errorAllQueries(err) {
            const enqueueError = (query) => {
              process.nextTick(() => {
                query.handleError(err, this.connection)
              })
            }

            if (this.activeQuery) {
              enqueueError(this.activeQuery)
              this.activeQuery = null
            }

            this.queryQueue.forEach(enqueueError)
            this.queryQueue.length = 0
          }

          _connect(callback) {
            const self = this
            const con = this.connection
            this._connectionCallback = callback

            if (this._connecting || this._connected) {
              const err = new Error('Client has already been connected. You cannot reuse a client.')
              process.nextTick(() => {
                callback(err)
              })
              return
            }
            this._connecting = true

            if (this._connectionTimeoutMillis > 0) {
              this.connectionTimeoutHandle = setTimeout(() => {
                con._ending = true
                con.stream.destroy(new Error('timeout expired'))
              }, this._connectionTimeoutMillis)

              if (this.connectionTimeoutHandle.unref) {
                this.connectionTimeoutHandle.unref()
              }
            }

            if (this.host && this.host.indexOf('/') === 0) {
              con.connect(this.host + '/.s.PGSQL.' + this.port)
            } else {
              con.connect(this.port, this.host)
            }

            // once connection is established send startup message
            con.on('connect', function () {
              if (self.ssl) {
                con.requestSsl()
              } else {
                con.startup(self.getStartupConf())
              }
            })

            con.on('sslconnect', function () {
              con.startup(self.getStartupConf())
            })

            this._attachListeners(con)

            con.once('end', () => {
              const error = this._ending ? new Error('Connection terminated') : new Error('Connection terminated unexpectedly')

              clearTimeout(this.connectionTimeoutHandle)
              this._errorAllQueries(error)
              this._ended = true

              if (!this._ending) {
                // if the connection is ended without us calling .end()
                // on this client then we have an unexpected disconnection
                // treat this as an error unless we've already emitted an error
                // during connection.
                if (this._connecting && !this._connectionError) {
                  if (this._connectionCallback) {
                    this._connectionCallback(error)
                  } else {
                    this._handleErrorEvent(error)
                  }
                } else if (!this._connectionError) {
                  this._handleErrorEvent(error)
                }
              }

              process.nextTick(() => {
                this.emit('end')
              })
            })
          }

          connect(callback) {
            if (callback) {
              this._connect(callback)
              return
            }

            return new this._Promise((resolve, reject) => {
              this._connect((error) => {
                if (error) {
                  reject(error)
                } else {
                  resolve()
                }
              })
            })
          }

          _attachListeners(con) {
            // password request handling
            con.on('authenticationCleartextPassword', this._handleAuthCleartextPassword.bind(this))
            // password request handling
            con.on('authenticationMD5Password', this._handleAuthMD5Password.bind(this))
            // password request handling (SASL)
            con.on('authenticationSASL', this._handleAuthSASL.bind(this))
            con.on('authenticationSASLContinue', this._handleAuthSASLContinue.bind(this))
            con.on('authenticationSASLFinal', this._handleAuthSASLFinal.bind(this))
            con.on('backendKeyData', this._handleBackendKeyData.bind(this))
            con.on('error', this._handleErrorEvent.bind(this))
            con.on('errorMessage', this._handleErrorMessage.bind(this))
            con.on('readyForQuery', this._handleReadyForQuery.bind(this))
            con.on('notice', this._handleNotice.bind(this))
            con.on('rowDescription', this._handleRowDescription.bind(this))
            con.on('dataRow', this._handleDataRow.bind(this))
            con.on('portalSuspended', this._handlePortalSuspended.bind(this))
            con.on('emptyQuery', this._handleEmptyQuery.bind(this))
            con.on('commandComplete', this._handleCommandComplete.bind(this))
            con.on('parseComplete', this._handleParseComplete.bind(this))
            con.on('copyInResponse', this._handleCopyInResponse.bind(this))
            con.on('copyData', this._handleCopyData.bind(this))
            con.on('notification', this._handleNotification.bind(this))
          }

          // TODO(bmc): deprecate pgpass "built in" integration since this.password can be a function
          // it can be supplied by the user if required - this is a breaking change!
          _checkPgPass(cb) {
            const con = this.connection
            if (typeof this.password === 'function') {
              this._Promise
                .resolve()
                .then(() => this.password())
                .then((pass) => {
                  if (pass !== undefined) {
                    if (typeof pass !== 'string') {
                      con.emit('error', new TypeError('Password must be a string'))
                      return
                    }
                    this.connectionParameters.password = this.password = pass
                  } else {
                    this.connectionParameters.password = this.password = null
                  }
                  cb()
                })
                .catch((err) => {
                  con.emit('error', err)
                })
            } else if (this.password !== null) {
              cb()
            } else {
              try {
                const pgPass = __webpack_require__(5489)
                pgPass(this.connectionParameters, (pass) => {
                  if (undefined !== pass) {
                    this.connectionParameters.password = this.password = pass
                  }
                  cb()
                })
              } catch (e) {
                this.emit('error', e)
              }
            }
          }

          _handleAuthCleartextPassword(msg) {
            this._checkPgPass(() => {
              this.connection.password(this.password)
            })
          }

          _handleAuthMD5Password(msg) {
            this._checkPgPass(async () => {
              try {
                const hashedPassword = await crypto.postgresMd5PasswordHash(this.user, this.password, msg.salt)
                this.connection.password(hashedPassword)
              } catch (e) {
                this.emit('error', e)
              }
            })
          }

          _handleAuthSASL(msg) {
            this._checkPgPass(() => {
              try {
                this.saslSession = sasl.startSession(msg.mechanisms, this.enableChannelBinding && this.connection.stream)
                this.connection.sendSASLInitialResponseMessage(this.saslSession.mechanism, this.saslSession.response)
              } catch (err) {
                this.connection.emit('error', err)
              }
            })
          }

          async _handleAuthSASLContinue(msg) {
            try {
              await sasl.continueSession(
                this.saslSession,
                this.password,
                msg.data,
                this.enableChannelBinding && this.connection.stream
              )
              this.connection.sendSCRAMClientFinalMessage(this.saslSession.response)
            } catch (err) {
              this.connection.emit('error', err)
            }
          }

          _handleAuthSASLFinal(msg) {
            try {
              sasl.finalizeSession(this.saslSession, msg.data)
              this.saslSession = null
            } catch (err) {
              this.connection.emit('error', err)
            }
          }

          _handleBackendKeyData(msg) {
            this.processID = msg.processID
            this.secretKey = msg.secretKey
          }

          _handleReadyForQuery(msg) {
            if (this._connecting) {
              this._connecting = false
              this._connected = true
              clearTimeout(this.connectionTimeoutHandle)

              // process possible callback argument to Client#connect
              if (this._connectionCallback) {
                this._connectionCallback(null, this)
                // remove callback for proper error handling
                // after the connect event
                this._connectionCallback = null
              }
              this.emit('connect')
            }
            const { activeQuery } = this
            this.activeQuery = null
            this.readyForQuery = true
            if (activeQuery) {
              activeQuery.handleReadyForQuery(this.connection)
            }
            this._pulseQueryQueue()
          }

          // if we receive an error event or error message
          // during the connection process we handle it here
          _handleErrorWhileConnecting(err) {
            if (this._connectionError) {
              // TODO(bmc): this is swallowing errors - we shouldn't do this
              return
            }
            this._connectionError = true
            clearTimeout(this.connectionTimeoutHandle)
            if (this._connectionCallback) {
              return this._connectionCallback(err)
            }
            this.emit('error', err)
          }

          // if we're connected and we receive an error event from the connection
          // this means the socket is dead - do a hard abort of all queries and emit
          // the socket error on the client as well
          _handleErrorEvent(err) {
            if (this._connecting) {
              return this._handleErrorWhileConnecting(err)
            }
            this._queryable = false
            this._errorAllQueries(err)
            this.emit('error', err)
          }

          // handle error messages from the postgres backend
          _handleErrorMessage(msg) {
            if (this._connecting) {
              return this._handleErrorWhileConnecting(msg)
            }
            const activeQuery = this.activeQuery

            if (!activeQuery) {
              this._handleErrorEvent(msg)
              return
            }

            this.activeQuery = null
            activeQuery.handleError(msg, this.connection)
          }

          _handleRowDescription(msg) {
            // delegate rowDescription to active query
            this.activeQuery.handleRowDescription(msg)
          }

          _handleDataRow(msg) {
            // delegate dataRow to active query
            this.activeQuery.handleDataRow(msg)
          }

          _handlePortalSuspended(msg) {
            // delegate portalSuspended to active query
            this.activeQuery.handlePortalSuspended(this.connection)
          }

          _handleEmptyQuery(msg) {
            // delegate emptyQuery to active query
            this.activeQuery.handleEmptyQuery(this.connection)
          }

          _handleCommandComplete(msg) {
            if (this.activeQuery == null) {
              const error = new Error('Received unexpected commandComplete message from backend.')
              this._handleErrorEvent(error)
              return
            }
            // delegate commandComplete to active query
            this.activeQuery.handleCommandComplete(msg, this.connection)
          }

          _handleParseComplete() {
            if (this.activeQuery == null) {
              const error = new Error('Received unexpected parseComplete message from backend.')
              this._handleErrorEvent(error)
              return
            }
            // if a prepared statement has a name and properly parses
            // we track that its already been executed so we don't parse
            // it again on the same client
            if (this.activeQuery.name) {
              this.connection.parsedStatements[this.activeQuery.name] = this.activeQuery.text
            }
          }

          _handleCopyInResponse(msg) {
            this.activeQuery.handleCopyInResponse(this.connection)
          }

          _handleCopyData(msg) {
            this.activeQuery.handleCopyData(msg, this.connection)
          }

          _handleNotification(msg) {
            this.emit('notification', msg)
          }

          _handleNotice(msg) {
            this.emit('notice', msg)
          }

          getStartupConf() {
            const params = this.connectionParameters

            const data = {
              user: params.user,
              database: params.database,
            }

            const appName = params.application_name || params.fallback_application_name
            if (appName) {
              data.application_name = appName
            }
            if (params.replication) {
              data.replication = '' + params.replication
            }
            if (params.statement_timeout) {
              data.statement_timeout = String(parseInt(params.statement_timeout, 10))
            }
            if (params.lock_timeout) {
              data.lock_timeout = String(parseInt(params.lock_timeout, 10))
            }
            if (params.idle_in_transaction_session_timeout) {
              data.idle_in_transaction_session_timeout = String(parseInt(params.idle_in_transaction_session_timeout, 10))
            }
            if (params.options) {
              data.options = params.options
            }

            return data
          }

          cancel(client, query) {
            if (client.activeQuery === query) {
              const con = this.connection

              if (this.host && this.host.indexOf('/') === 0) {
                con.connect(this.host + '/.s.PGSQL.' + this.port)
              } else {
                con.connect(this.port, this.host)
              }

              // once connection is established send cancel message
              con.on('connect', function () {
                con.cancel(client.processID, client.secretKey)
              })
            } else if (client.queryQueue.indexOf(query) !== -1) {
              client.queryQueue.splice(client.queryQueue.indexOf(query), 1)
            }
          }

          setTypeParser(oid, format, parseFn) {
            return this._types.setTypeParser(oid, format, parseFn)
          }

          getTypeParser(oid, format) {
            return this._types.getTypeParser(oid, format)
          }

          // escapeIdentifier and escapeLiteral moved to utility functions & exported
          // on PG
          // re-exported here for backwards compatibility
          escapeIdentifier(str) {
            return utils.escapeIdentifier(str)
          }

          escapeLiteral(str) {
            return utils.escapeLiteral(str)
          }

          _pulseQueryQueue() {
            if (this.readyForQuery === true) {
              this.activeQuery = this.queryQueue.shift()
              if (this.activeQuery) {
                this.readyForQuery = false
                this.hasExecuted = true

                const queryError = this.activeQuery.submit(this.connection)
                if (queryError) {
                  process.nextTick(() => {
                    this.activeQuery.handleError(queryError, this.connection)
                    this.readyForQuery = true
                    this._pulseQueryQueue()
                  })
                }
              } else if (this.hasExecuted) {
                this.activeQuery = null
                this.emit('drain')
              }
            }
          }

          query(config, values, callback) {
            // can take in strings, config object or query object
            let query
            let result
            let readTimeout
            let readTimeoutTimer
            let queryCallback

            if (config === null || config === undefined) {
              throw new TypeError('Client was passed a null or undefined query')
            } else if (typeof config.submit === 'function') {
              readTimeout = config.query_timeout || this.connectionParameters.query_timeout
              result = query = config
              if (typeof values === 'function') {
                query.callback = query.callback || values
              }
            } else {
              readTimeout = config.query_timeout || this.connectionParameters.query_timeout
              query = new Query(config, values, callback)
              if (!query.callback) {
                result = new this._Promise((resolve, reject) => {
                  query.callback = (err, res) => (err ? reject(err) : resolve(res))
                }).catch((err) => {
                  // replace the stack trace that leads to `TCP.onStreamRead` with one that leads back to the
                  // application that created the query
                  Error.captureStackTrace(err)
                  throw err
                })
              }
            }

            if (readTimeout) {
              queryCallback = query.callback

              readTimeoutTimer = setTimeout(() => {
                const error = new Error('Query read timeout')

                process.nextTick(() => {
                  query.handleError(error, this.connection)
                })

                queryCallback(error)

                // we already returned an error,
                // just do nothing if query completes
                query.callback = () => { }

                // Remove from queue
                const index = this.queryQueue.indexOf(query)
                if (index > -1) {
                  this.queryQueue.splice(index, 1)
                }

                this._pulseQueryQueue()
              }, readTimeout)

              query.callback = (err, res) => {
                clearTimeout(readTimeoutTimer)
                queryCallback(err, res)
              }
            }

            if (this.binary && !query.binary) {
              query.binary = true
            }

            if (query._result && !query._result._types) {
              query._result._types = this._types
            }

            if (!this._queryable) {
              process.nextTick(() => {
                query.handleError(new Error('Client has encountered a connection error and is not queryable'), this.connection)
              })
              return result
            }

            if (this._ending) {
              process.nextTick(() => {
                query.handleError(new Error('Client was closed and is not queryable'), this.connection)
              })
              return result
            }

            this.queryQueue.push(query)
            this._pulseQueryQueue()
            return result
          }

          ref() {
            this.connection.ref()
          }

          unref() {
            this.connection.unref()
          }

          end(cb) {
            this._ending = true

            // if we have never connected, then end is a noop, callback immediately
            if (!this.connection._connecting || this._ended) {
              if (cb) {
                cb()
              } else {
                return this._Promise.resolve()
              }
            }

            if (this.activeQuery || !this._queryable) {
              // if we have an active query we need to force a disconnect
              // on the socket - otherwise a hung query could block end forever
              this.connection.stream.destroy()
            } else {
              this.connection.end()
            }

            if (cb) {
              this.connection.once('end', cb)
            } else {
              return new this._Promise((resolve) => {
                this.connection.once('end', resolve)
              })
            }
          }
        }

        // expose a Query constructor
        Client.Query = Query

        module.exports = Client


        /***/
}),

/***/ 7190:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

        "use strict";

        Object.defineProperty(exports, "__esModule", ({ value: true }));
        exports.serialize = void 0;
        const buffer_writer_1 = __webpack_require__(946);
        const writer = new buffer_writer_1.Writer();
        const startup = (opts) => {
          // protocol version
          writer.addInt16(3).addInt16(0);
          for (const key of Object.keys(opts)) {
            writer.addCString(key).addCString(opts[key]);
          }
          writer.addCString('client_encoding').addCString('UTF8');
          const bodyBuffer = writer.addCString('').flush();
          // this message is sent without a code
          const length = bodyBuffer.length + 4;
          return new buffer_writer_1.Writer().addInt32(length).add(bodyBuffer).flush();
        };
        const requestSsl = () => {
          const response = Buffer.allocUnsafe(8);
          response.writeInt32BE(8, 0);
          response.writeInt32BE(80877103, 4);
          return response;
        };
        const password = (password) => {
          return writer.addCString(password).flush(112 /* code.startup */);
        };
        const sendSASLInitialResponseMessage = function (mechanism, initialResponse) {
          // 0x70 = 'p'
          writer.addCString(mechanism).addInt32(Buffer.byteLength(initialResponse)).addString(initialResponse);
          return writer.flush(112 /* code.startup */);
        };
        const sendSCRAMClientFinalMessage = function (additionalData) {
          return writer.addString(additionalData).flush(112 /* code.startup */);
        };
        const query = (text) => {
          return writer.addCString(text).flush(81 /* code.query */);
        };
        const emptyArray = [];
        const parse = (query) => {
          // expect something like this:
          // { name: 'queryName',
          //   text: 'select * from blah',
          //   types: ['int8', 'bool'] }
          // normalize missing query names to allow for null
          const name = query.name || '';
          if (name.length > 63) {
            console.error('Warning! Postgres only supports 63 characters for query names.');
            console.error('You supplied %s (%s)', name, name.length);
            console.error('This can cause conflicts and silent errors executing queries');
          }
          const types = query.types || emptyArray;
          const len = types.length;
          const buffer = writer
            .addCString(name) // name of query
            .addCString(query.text) // actual query text
            .addInt16(len);
          for (let i = 0; i < len; i++) {
            buffer.addInt32(types[i]);
          }
          return writer.flush(80 /* code.parse */);
        };
        const paramWriter = new buffer_writer_1.Writer();
        const writeValues = function (values, valueMapper) {
          for (let i = 0; i < values.length; i++) {
            const mappedVal = valueMapper ? valueMapper(values[i], i) : values[i];
            if (mappedVal == null) {
              // add the param type (string) to the writer
              writer.addInt16(0 /* ParamType.STRING */);
              // write -1 to the param writer to indicate null
              paramWriter.addInt32(-1);
            }
            else if (mappedVal instanceof Buffer) {
              // add the param type (binary) to the writer
              writer.addInt16(1 /* ParamType.BINARY */);
              // add the buffer to the param writer
              paramWriter.addInt32(mappedVal.length);
              paramWriter.add(mappedVal);
            }
            else {
              // add the param type (string) to the writer
              writer.addInt16(0 /* ParamType.STRING */);
              paramWriter.addInt32(Buffer.byteLength(mappedVal));
              paramWriter.addString(mappedVal);
            }
          }
        };
        const bind = (config = {}) => {
          // normalize config
          const portal = config.portal || '';
          const statement = config.statement || '';
          const binary = config.binary || false;
          const values = config.values || emptyArray;
          const len = values.length;
          writer.addCString(portal).addCString(statement);
          writer.addInt16(len);
          writeValues(values, config.valueMapper);
          writer.addInt16(len);
          writer.add(paramWriter.flush());
          // all results use the same format code
          writer.addInt16(1);
          // format code
          writer.addInt16(binary ? 1 /* ParamType.BINARY */ : 0 /* ParamType.STRING */);
          return writer.flush(66 /* code.bind */);
        };
        const emptyExecute = Buffer.from([69 /* code.execute */, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x00, 0x00]);
        const execute = (config) => {
          // this is the happy path for most queries
          if (!config || (!config.portal && !config.rows)) {
            return emptyExecute;
          }
          const portal = config.portal || '';
          const rows = config.rows || 0;
          const portalLength = Buffer.byteLength(portal);
          const len = 4 + portalLength + 1 + 4;
          // one extra bit for code
          const buff = Buffer.allocUnsafe(1 + len);
          buff[0] = 69 /* code.execute */;
          buff.writeInt32BE(len, 1);
          buff.write(portal, 5, 'utf-8');
          buff[portalLength + 5] = 0; // null terminate portal cString
          buff.writeUInt32BE(rows, buff.length - 4);
          return buff;
        };
        const cancel = (processID, secretKey) => {
          const buffer = Buffer.allocUnsafe(16);
          buffer.writeInt32BE(16, 0);
          buffer.writeInt16BE(1234, 4);
          buffer.writeInt16BE(5678, 6);
          buffer.writeInt32BE(processID, 8);
          buffer.writeInt32BE(secretKey, 12);
          return buffer;
        };
        const cstringMessage = (code, string) => {
          const stringLen = Buffer.byteLength(string);
          const len = 4 + stringLen + 1;
          // one extra bit for code
          const buffer = Buffer.allocUnsafe(1 + len);
          buffer[0] = code;
          buffer.writeInt32BE(len, 1);
          buffer.write(string, 5, 'utf-8');
          buffer[len] = 0; // null terminate cString
          return buffer;
        };
        const emptyDescribePortal = writer.addCString('P').flush(68 /* code.describe */);
        const emptyDescribeStatement = writer.addCString('S').flush(68 /* code.describe */);
        const describe = (msg) => {
          return msg.name
            ? cstringMessage(68 /* code.describe */, `${msg.type}${msg.name || ''}`)
            : msg.type === 'P'
              ? emptyDescribePortal
              : emptyDescribeStatement;
        };
        const close = (msg) => {
          const text = `${msg.type}${msg.name || ''}`;
          return cstringMessage(67 /* code.close */, text);
        };
        const copyData = (chunk) => {
          return writer.add(chunk).flush(100 /* code.copyFromChunk */);
        };
        const copyFail = (message) => {
          return cstringMessage(102 /* code.copyFail */, message);
        };
        const codeOnlyBuffer = (code) => Buffer.from([code, 0x00, 0x00, 0x00, 0x04]);
        const flushBuffer = codeOnlyBuffer(72 /* code.flush */);
        const syncBuffer = codeOnlyBuffer(83 /* code.sync */);
        const endBuffer = codeOnlyBuffer(88 /* code.end */);
        const copyDoneBuffer = codeOnlyBuffer(99 /* code.copyDone */);
        const serialize = {
          startup,
          password,
          requestSsl,
          sendSASLInitialResponseMessage,
          sendSCRAMClientFinalMessage,
          query,
          parse,
          bind,
          execute,
          describe,
          close,
          flush: () => flushBuffer,
          sync: () => syncBuffer,
          end: () => endBuffer,
          copyData,
          copyDone: () => copyDoneBuffer,
          copyFail,
          cancel,
        };
        exports.serialize = serialize;
        //# sourceMappingURL=serializer.js.map

        /***/
}),

/***/ 8046:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        const EventEmitter = (__webpack_require__(4434).EventEmitter)

        const { parse, serialize } = __webpack_require__(5252)
        const { getStream, getSecureStream } = __webpack_require__(5202)

        const flushBuffer = serialize.flush()
        const syncBuffer = serialize.sync()
        const endBuffer = serialize.end()

        // TODO(bmc) support binary mode at some point
        class Connection extends EventEmitter {
          constructor(config) {
            super()
            config = config || {}

            this.stream = config.stream || getStream(config.ssl)
            if (typeof this.stream === 'function') {
              this.stream = this.stream(config)
            }

            this._keepAlive = config.keepAlive
            this._keepAliveInitialDelayMillis = config.keepAliveInitialDelayMillis
            this.lastBuffer = false
            this.parsedStatements = {}
            this.ssl = config.ssl || false
            this._ending = false
            this._emitMessage = false
            const self = this
            this.on('newListener', function (eventName) {
              if (eventName === 'message') {
                self._emitMessage = true
              }
            })
          }

          connect(port, host) {
            const self = this

            this._connecting = true
            this.stream.setNoDelay(true)
            this.stream.connect(port, host)

            this.stream.once('connect', function () {
              if (self._keepAlive) {
                self.stream.setKeepAlive(true, self._keepAliveInitialDelayMillis)
              }
              self.emit('connect')
            })

            const reportStreamError = function (error) {
              // errors about disconnections should be ignored during disconnect
              if (self._ending && (error.code === 'ECONNRESET' || error.code === 'EPIPE')) {
                return
              }
              self.emit('error', error)
            }
            this.stream.on('error', reportStreamError)

            this.stream.on('close', function () {
              self.emit('end')
            })

            if (!this.ssl) {
              return this.attachListeners(this.stream)
            }

            this.stream.once('data', function (buffer) {
              const responseCode = buffer.toString('utf8')
              switch (responseCode) {
                case 'S': // Server supports SSL connections, continue with a secure connection
                  break
                case 'N': // Server does not support SSL connections
                  self.stream.end()
                  return self.emit('error', new Error('The server does not support SSL connections'))
                default:
                  // Any other response byte, including 'E' (ErrorResponse) indicating a server error
                  self.stream.end()
                  return self.emit('error', new Error('There was an error establishing an SSL connection'))
              }
              const options = {
                socket: self.stream,
              }

              if (self.ssl !== true) {
                Object.assign(options, self.ssl)

                if ('key' in self.ssl) {
                  options.key = self.ssl.key
                }
              }

              const net = __webpack_require__(9278)
              if (net.isIP && net.isIP(host) === 0) {
                options.servername = host
              }
              try {
                self.stream = getSecureStream(options)
              } catch (err) {
                return self.emit('error', err)
              }
              self.attachListeners(self.stream)
              self.stream.on('error', reportStreamError)

              self.emit('sslconnect')
            })
          }

          attachListeners(stream) {
            parse(stream, (msg) => {
              const eventName = msg.name === 'error' ? 'errorMessage' : msg.name
              if (this._emitMessage) {
                this.emit('message', msg)
              }
              this.emit(eventName, msg)
            })
          }

          requestSsl() {
            this.stream.write(serialize.requestSsl())
          }

          startup(config) {
            this.stream.write(serialize.startup(config))
          }

          cancel(processID, secretKey) {
            this._send(serialize.cancel(processID, secretKey))
          }

          password(password) {
            this._send(serialize.password(password))
          }

          sendSASLInitialResponseMessage(mechanism, initialResponse) {
            this._send(serialize.sendSASLInitialResponseMessage(mechanism, initialResponse))
          }

          sendSCRAMClientFinalMessage(additionalData) {
            this._send(serialize.sendSCRAMClientFinalMessage(additionalData))
          }

          _send(buffer) {
            if (!this.stream.writable) {
              return false
            }
            return this.stream.write(buffer)
          }

          query(text) {
            this._send(serialize.query(text))
          }

          // send parse message
          parse(query) {
            this._send(serialize.parse(query))
          }

          // send bind message
          bind(config) {
            this._send(serialize.bind(config))
          }

          // send execute message
          execute(config) {
            this._send(serialize.execute(config))
          }

          flush() {
            if (this.stream.writable) {
              this.stream.write(flushBuffer)
            }
          }

          sync() {
            this._ending = true
            this._send(syncBuffer)
          }

          ref() {
            this.stream.ref()
          }

          unref() {
            this.stream.unref()
          }

          end() {
            // 0x58 = 'X'
            this._ending = true
            if (!this._connecting || !this.stream.writable) {
              this.stream.end()
              return
            }
            return this.stream.write(endBuffer, () => {
              this.stream.end()
            })
          }

          close(msg) {
            this._send(serialize.close(msg))
          }

          describe(msg) {
            this._send(serialize.describe(msg))
          }

          sendCopyFromChunk(chunk) {
            this._send(serialize.copyData(chunk))
          }

          endCopyFrom() {
            this._send(serialize.copyDone())
          }

          sendCopyFail(msg) {
            this._send(serialize.copyFail(msg))
          }
        }

        module.exports = Connection


        /***/
}),

/***/ 8082:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";

        module.exports = __webpack_require__(3643)


        /***/
}),

/***/ 8221:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        const useLegacyCrypto = parseInt(process.versions && process.versions.node && process.versions.node.split('.')[0]) < 15
        if (useLegacyCrypto) {
          // We are on an old version of Node.js that requires legacy crypto utilities.
          module.exports = __webpack_require__(8977)
        } else {
          module.exports = __webpack_require__(459)
        }


        /***/
}),

/***/ 8244:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        var extend = __webpack_require__(5956)

        module.exports = PostgresInterval

        function PostgresInterval(raw) {
          if (!(this instanceof PostgresInterval)) {
            return new PostgresInterval(raw)
          }
          extend(this, parse(raw))
        }
        var properties = ['seconds', 'minutes', 'hours', 'days', 'months', 'years']
        PostgresInterval.prototype.toPostgres = function () {
          var filtered = properties.filter(this.hasOwnProperty, this)

          // In addition to `properties`, we need to account for fractions of seconds.
          if (this.milliseconds && filtered.indexOf('seconds') < 0) {
            filtered.push('seconds')
          }

          if (filtered.length === 0) return '0'
          return filtered
            .map(function (property) {
              var value = this[property] || 0

              // Account for fractional part of seconds,
              // remove trailing zeroes.
              if (property === 'seconds' && this.milliseconds) {
                value = (value + this.milliseconds / 1000).toFixed(6).replace(/\.?0+$/, '')
              }

              return value + ' ' + property
            }, this)
            .join(' ')
        }

        var propertiesISOEquivalent = {
          years: 'Y',
          months: 'M',
          days: 'D',
          hours: 'H',
          minutes: 'M',
          seconds: 'S'
        }
        var dateProperties = ['years', 'months', 'days']
        var timeProperties = ['hours', 'minutes', 'seconds']
        // according to ISO 8601
        PostgresInterval.prototype.toISOString = PostgresInterval.prototype.toISO = function () {
          var datePart = dateProperties
            .map(buildProperty, this)
            .join('')

          var timePart = timeProperties
            .map(buildProperty, this)
            .join('')

          return 'P' + datePart + 'T' + timePart

          function buildProperty(property) {
            var value = this[property] || 0

            // Account for fractional part of seconds,
            // remove trailing zeroes.
            if (property === 'seconds' && this.milliseconds) {
              value = (value + this.milliseconds / 1000).toFixed(6).replace(/0+$/, '')
            }

            return value + propertiesISOEquivalent[property]
          }
        }

        var NUMBER = '([+-]?\\d+)'
        var YEAR = NUMBER + '\\s+years?'
        var MONTH = NUMBER + '\\s+mons?'
        var DAY = NUMBER + '\\s+days?'
        var TIME = '([+-])?([\\d]*):(\\d\\d):(\\d\\d)\\.?(\\d{1,6})?'
        var INTERVAL = new RegExp([YEAR, MONTH, DAY, TIME].map(function (regexString) {
          return '(' + regexString + ')?'
        })
          .join('\\s*'))

        // Positions of values in regex match
        var positions = {
          years: 2,
          months: 4,
          days: 6,
          hours: 9,
          minutes: 10,
          seconds: 11,
          milliseconds: 12
        }
        // We can use negative time
        var negatives = ['hours', 'minutes', 'seconds', 'milliseconds']

        function parseMilliseconds(fraction) {
          // add omitted zeroes
          var microseconds = fraction + '000000'.slice(fraction.length)
          return parseInt(microseconds, 10) / 1000
        }

        function parse(interval) {
          if (!interval) return {}
          var matches = INTERVAL.exec(interval)
          var isNegative = matches[8] === '-'
          return Object.keys(positions)
            .reduce(function (parsed, property) {
              var position = positions[property]
              var value = matches[position]
              // no empty string
              if (!value) return parsed
              // milliseconds are actually microseconds (up to 6 digits)
              // with omitted trailing zeroes.
              value = property === 'milliseconds'
                ? parseMilliseconds(value)
                : parseInt(value, 10)
              // no zeros
              if (!value) return parsed
              if (isNegative && ~negatives.indexOf(property)) {
                value *= -1
              }
              parsed[property] = value
              return parsed
            }, {})
        }


        /***/
}),

/***/ 8282:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        var array = __webpack_require__(6606);

        module.exports = {
          create: function (source, transform) {
            return {
              parse: function () {
                return array.parse(source, transform);
              }
            };
          }
        };


        /***/
}),

/***/ 8583:
/***/ ((module) => {

        "use strict";
        module.exports = require("pg-native");

        /***/
}),

/***/ 8686:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";


        const types = __webpack_require__(3988)

        function TypeOverrides(userTypes) {
          this._types = userTypes || types
          this.text = {}
          this.binary = {}
        }

        TypeOverrides.prototype.getOverrides = function (format) {
          switch (format) {
            case 'text':
              return this.text
            case 'binary':
              return this.binary
            default:
              return {}
          }
        }

        TypeOverrides.prototype.setTypeParser = function (oid, format, parseFn) {
          if (typeof format === 'function') {
            parseFn = format
            format = 'text'
          }
          this.getOverrides(format)[oid] = parseFn
        }

        TypeOverrides.prototype.getTypeParser = function (oid, format) {
          format = format || 'text'
          return this.getOverrides(format)[oid] || this._types.getTypeParser(oid, format)
        }

        module.exports = TypeOverrides


        /***/
}),

/***/ 8977:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

        "use strict";

        // This file contains crypto utility functions for versions of Node.js < 15.0.0,
        // which does not support the WebCrypto.subtle API.

        const nodeCrypto = __webpack_require__(6982)

        function md5(string) {
          return nodeCrypto.createHash('md5').update(string, 'utf-8').digest('hex')
        }

        // See AuthenticationMD5Password at https://www.postgresql.org/docs/current/static/protocol-flow.html
        function postgresMd5PasswordHash(user, password, salt) {
          const inner = md5(password + user)
          const outer = md5(Buffer.concat([Buffer.from(inner), salt]))
          return 'md5' + outer
        }

        function sha256(text) {
          return nodeCrypto.createHash('sha256').update(text).digest()
        }

        function hashByName(hashName, text) {
          hashName = hashName.replace(/(\D)-/, '$1') // e.g. SHA-256 -> SHA256
          return nodeCrypto.createHash(hashName).update(text).digest()
        }

        function hmacSha256(key, msg) {
          return nodeCrypto.createHmac('sha256', key).update(msg).digest()
        }

        async function deriveKey(password, salt, iterations) {
          return nodeCrypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256')
        }

        module.exports = {
          postgresMd5PasswordHash,
          randomBytes: nodeCrypto.randomBytes,
          deriveKey,
          sha256,
          hashByName,
          hmacSha256,
          md5,
        }


        /***/
}),

/***/ 9023:
/***/ ((module) => {

        "use strict";
        module.exports = require("util");

        /***/
}),

/***/ 9141:
/***/ ((module) => {

        "use strict";


        var DATE_TIME = /(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?.*?( BC)?$/
        var DATE = /^(\d{1,})-(\d{2})-(\d{2})( BC)?$/
        var TIME_ZONE = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/
        var INFINITY = /^-?infinity$/

        module.exports = function parseDate(isoDate) {
          if (INFINITY.test(isoDate)) {
            // Capitalize to Infinity before passing to Number
            return Number(isoDate.replace('i', 'I'))
          }
          var matches = DATE_TIME.exec(isoDate)

          if (!matches) {
            // Force YYYY-MM-DD dates to be parsed as local time
            return getDate(isoDate) || null
          }

          var isBC = !!matches[8]
          var year = parseInt(matches[1], 10)
          if (isBC) {
            year = bcYearToNegativeYear(year)
          }

          var month = parseInt(matches[2], 10) - 1
          var day = matches[3]
          var hour = parseInt(matches[4], 10)
          var minute = parseInt(matches[5], 10)
          var second = parseInt(matches[6], 10)

          var ms = matches[7]
          ms = ms ? 1000 * parseFloat(ms) : 0

          var date
          var offset = timeZoneOffset(isoDate)
          if (offset != null) {
            date = new Date(Date.UTC(year, month, day, hour, minute, second, ms))

            // Account for years from 0 to 99 being interpreted as 1900-1999
            // by Date.UTC / the multi-argument form of the Date constructor
            if (is0To99(year)) {
              date.setUTCFullYear(year)
            }

            if (offset !== 0) {
              date.setTime(date.getTime() - offset)
            }
          } else {
            date = new Date(year, month, day, hour, minute, second, ms)

            if (is0To99(year)) {
              date.setFullYear(year)
            }
          }

          return date
        }

        function getDate(isoDate) {
          var matches = DATE.exec(isoDate)
          if (!matches) {
            return
          }

          var year = parseInt(matches[1], 10)
          var isBC = !!matches[4]
          if (isBC) {
            year = bcYearToNegativeYear(year)
          }

          var month = parseInt(matches[2], 10) - 1
          var day = matches[3]
          // YYYY-MM-DD will be parsed as local time
          var date = new Date(year, month, day)

          if (is0To99(year)) {
            date.setFullYear(year)
          }

          return date
        }

        // match timezones:
        // Z (UTC)
        // -05
        // +06:30
        function timeZoneOffset(isoDate) {
          if (isoDate.endsWith('+00')) {
            return 0
          }

          var zone = TIME_ZONE.exec(isoDate.split(' ')[1])
          if (!zone) return
          var type = zone[1]

          if (type === 'Z') {
            return 0
          }
          var sign = type === '-' ? -1 : 1
          var offset = parseInt(zone[2], 10) * 3600 +
            parseInt(zone[3] || 0, 10) * 60 +
            parseInt(zone[4] || 0, 10)

          return offset * sign * 1000
        }

        function bcYearToNegativeYear(year) {
          // Account for numerical difference between representations of BC years
          // See: https://github.com/bendrucker/postgres-date/issues/5
          return -(year - 1)
        }

        function is0To99(num) {
          return num >= 0 && num < 100
        }


        /***/
}),

/***/ 9278:
/***/ ((module) => {

        "use strict";
        module.exports = require("net");

        /***/
}),

/***/ 9888:
/***/ ((module) => {

        "use strict";


        // selected so (BASE - 1) * 0x100000000 + 0xffffffff is a safe integer
        var BASE = 1000000;

        function readInt8(buffer) {
          var high = buffer.readInt32BE(0);
          var low = buffer.readUInt32BE(4);
          var sign = '';

          if (high < 0) {
            high = ~high + (low === 0);
            low = (~low + 1) >>> 0;
            sign = '-';
          }

          var result = '';
          var carry;
          var t;
          var digits;
          var pad;
          var l;
          var i;

          {
            carry = high % BASE;
            high = high / BASE >>> 0;

            t = 0x100000000 * carry + low;
            low = t / BASE >>> 0;
            digits = '' + (t - BASE * low);

            if (low === 0 && high === 0) {
              return sign + digits + result;
            }

            pad = '';
            l = 6 - digits.length;

            for (i = 0; i < l; i++) {
              pad += '0';
            }

            result = pad + digits + result;
          }

          {
            carry = high % BASE;
            high = high / BASE >>> 0;

            t = 0x100000000 * carry + low;
            low = t / BASE >>> 0;
            digits = '' + (t - BASE * low);

            if (low === 0 && high === 0) {
              return sign + digits + result;
            }

            pad = '';
            l = 6 - digits.length;

            for (i = 0; i < l; i++) {
              pad += '0';
            }

            result = pad + digits + result;
          }

          {
            carry = high % BASE;
            high = high / BASE >>> 0;

            t = 0x100000000 * carry + low;
            low = t / BASE >>> 0;
            digits = '' + (t - BASE * low);

            if (low === 0 && high === 0) {
              return sign + digits + result;
            }

            pad = '';
            l = 6 - digits.length;

            for (i = 0; i < l; i++) {
              pad += '0';
            }

            result = pad + digits + result;
          }

          {
            carry = high % BASE;
            t = 0x100000000 * carry + low;
            digits = '' + t % BASE;

            return sign + digits + result;
          }
        }

        module.exports = readInt8;


        /***/
}),

/***/ 9896:
/***/ ((module) => {

        "use strict";
        module.exports = require("fs");

        /***/
})

    /******/
});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
      /******/
}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
      /******/
};
/******/
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
    /******/
}
  /******/
  /************************************************************************/
  var __webpack_exports__ = {};
  // src/server.js
  const {
    Pool,
    Client
  } = __webpack_require__(1596);
  class OxPgSQL {
    constructor() {
      this.pool = null;
      this.isReady = false;
      this.preparedStatements = new Map();
      this.connectionConfig = this.getConnectionConfig();
      this.queryCount = 0;
      this.slowQueryThreshold = GetConvarInt('pgsql_slow_query_warning', 100);
      this.debugMode = GetConvar('pgsql_debug', 'false') === 'true';
      this.booleanColumns = new Set(); // Cache for known boolean columns
      this.init();
    }
    getConnectionConfig() {
      const connectionString = GetConvar('pgsql_connection_string', '');
      if (connectionString) {
        return {
          connectionString: connectionString,
          max: GetConvarInt('pgsql_max_connections', 20),
          min: GetConvarInt('pgsql_min_connections', 5),
          idleTimeoutMillis: GetConvarInt('pgsql_idle_timeout', 30000),
          connectionTimeoutMillis: GetConvarInt('pgsql_connection_timeout', 10000),
          acquireTimeoutMillis: GetConvarInt('pgsql_acquire_timeout', 10000),
          ssl: GetConvar('pgsql_ssl', 'true') === 'true' ? {
            rejectUnauthorized: false
          } : false,
          statement_timeout: GetConvarInt('pgsql_statement_timeout', 60000),
          query_timeout: GetConvarInt('pgsql_query_timeout', 60000),
          application_name: 'FiveM-oxpgsql'
        };
      }
      return {
        host: GetConvar('pgsql_host', 'localhost'),
        port: GetConvarInt('pgsql_port', 5432),
        database: GetConvar('pgsql_database', 'fivem'),
        user: GetConvar('pgsql_user', 'postgres'),
        password: GetConvar('pgsql_password', ''),
        max: GetConvarInt('pgsql_max_connections', 20),
        min: GetConvarInt('pgsql_min_connections', 5),
        idleTimeoutMillis: GetConvarInt('pgsql_idle_timeout', 30000),
        connectionTimeoutMillis: GetConvarInt('pgsql_connection_timeout', 10000),
        acquireTimeoutMillis: GetConvarInt('pgsql_acquire_timeout', 10000),
        ssl: GetConvar('pgsql_ssl', 'true') === 'true' ? {
          rejectUnauthorized: false
        } : false,
        statement_timeout: GetConvarInt('pgsql_statement_timeout', 60000),
        query_timeout: GetConvarInt('pgsql_query_timeout', 60000),
        application_name: 'FiveM-oxpgsql'
      };
    }
    async init() {
      try {
        this.pool = new Pool(this.connectionConfig);

        // Test connection
        const client = await this.pool.connect();
        const result = await client.query('SELECT NOW() as server_time, version() as version');
        client.release();
        this.isReady = true;
        console.log('^6NEONDB: ^7Connected to PostgreSQL database successfully');
        console.log('^6NEONDB: ^7Server time:', result.rows[0].server_time);
        console.log('^6NEONDB: ^7PostgreSQL version:', result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]);
        console.log('^6NEONDB: ^7Connection pool initialized with', this.connectionConfig.max, 'max connections');

        // Handle pool events
        this.pool.on('error', err => {
          console.error('^6NEONDB: ^7Pool error:', err.message);
        });
        this.pool.on('connect', client => {
          if (this.debugMode) {
            console.log('^6NEONDB: ^7New client connected');
          }
        });
        this.pool.on('acquire', client => {
          if (this.debugMode) {
            console.log('^6NEONDB: ^7Client acquired from pool');
          }
        });
        this.pool.on('remove', client => {
          if (this.debugMode) {
            console.log('^6NEONDB: ^7Client removed from pool');
          }
        });
      } catch (error) {
        console.error('^6NEONDB: ^7Failed to connect to database:', error.message);
        this.isReady = false;
      }
    }
    parseParameters(parameters) {
      if (!parameters) return [];
      if (Array.isArray(parameters)) {
        return parameters; // Don't auto-convert parameters
      }
      if (typeof parameters === 'object') {
        return Object.values(parameters);
      }
      return [parameters];
    }

    // Common boolean column names that are likely to be boolean fields
    getBooleanColumnPatterns() {
      return ['enabled', 'enable', 'disabled', 'disable', 'active', 'inactive', 'is_active', 'is_enabled', 'visible', 'hidden', 'is_visible', 'is_hidden', 'online', 'offline', 'is_online', 'banned', 'is_banned', 'locked', 'is_locked', 'verified', 'is_verified', 'approved', 'is_approved', 'deleted', 'is_deleted', 'archived', 'is_archived', 'public', 'private', 'is_public', 'is_private', 'for_sale', 'available', 'is_available', 'completed', 'is_completed', 'finished', 'is_finished',
        // Add more boolean column patterns here as needed
        'status', 'is_status', 'valid', 'is_valid', 'paid', 'is_paid', 'processed', 'is_processed', 'confirmed', 'is_confirmed', 'flagged', 'is_flagged', 'subscribed', 'is_subscribed', 'premium', 'is_premium'];
    }
    convertMySQLToPostgreSQL(query) {
      let convertedQuery = query;
      let paramIndex = 1;

      // Replace ? with $1, $2, etc.
      convertedQuery = convertedQuery.replace(/\?/g, () => `$${paramIndex++}`);

      // Convert MySQL specific functions to PostgreSQL
      convertedQuery = convertedQuery.replace(/NOW\(\)/gi, 'NOW()');
      convertedQuery = convertedQuery.replace(/UNIX_TIMESTAMP\(\)/gi, 'EXTRACT(EPOCH FROM NOW())');
      convertedQuery = convertedQuery.replace(/UNIX_TIMESTAMP\(([^)]+)\)/gi, 'EXTRACT(EPOCH FROM $1)');
      convertedQuery = convertedQuery.replace(/FROM_UNIXTIME\(([^)]+)\)/gi, 'TO_TIMESTAMP($1)');
      convertedQuery = convertedQuery.replace(/LIMIT\s+(\d+)\s*,\s*(\d+)/gi, 'LIMIT $2 OFFSET $1');
      convertedQuery = convertedQuery.replace(/`/g, '"');
      convertedQuery = convertedQuery.replace(/AUTO_INCREMENT/gi, 'SERIAL');
      convertedQuery = convertedQuery.replace(/INT\s+UNSIGNED/gi, 'INTEGER');
      convertedQuery = convertedQuery.replace(/BIGINT\s+UNSIGNED/gi, 'BIGINT');
      convertedQuery = convertedQuery.replace(/TINYINT\(1\)/gi, 'BOOLEAN');
      convertedQuery = convertedQuery.replace(/DATETIME/gi, 'TIMESTAMP');
      convertedQuery = convertedQuery.replace(/TEXT/gi, 'TEXT');

      // Get boolean column patterns
      const booleanColumns = this.getBooleanColumnPatterns();
      const booleanPattern = `\\b(${booleanColumns.join('|')})\\b`;

      // CASE 1: Handle "column = 1" or "column = 0" by converting to "column::integer = 1/0"
      // This handles integer to boolean comparisons
      const equalsOneRegex = new RegExp(`${booleanPattern}\\s*=\\s*1\\b(?!\\d)`, 'gi');
      const equalsZeroRegex = new RegExp(`${booleanPattern}\\s*=\\s*0\\b(?!\\d)`, 'gi');
      const notEqualsOneRegex = new RegExp(`${booleanPattern}\\s*(?:!=|<>)\\s*1\\b(?!\\d)`, 'gi');
      const notEqualsZeroRegex = new RegExp(`${booleanPattern}\\s*(?:!=|<>)\\s*0\\b(?!\\d)`, 'gi');
      convertedQuery = convertedQuery.replace(equalsOneRegex, '$1::integer = 1');
      convertedQuery = convertedQuery.replace(equalsZeroRegex, '$1::integer = 0');
      convertedQuery = convertedQuery.replace(notEqualsOneRegex, '$1::integer != 1');
      convertedQuery = convertedQuery.replace(notEqualsZeroRegex, '$1::integer != 0');

      // CASE 2: Handle "column = true" or "column = false" by converting to "(column::integer)::boolean = true/false"
      // This handles boolean to integer comparisons
      const equalsTrueRegex = new RegExp(`${booleanPattern}\\s*=\\s*true\\b`, 'gi');
      const equalsFalseRegex = new RegExp(`${booleanPattern}\\s*=\\s*false\\b`, 'gi');
      const notEqualsTrueRegex = new RegExp(`${booleanPattern}\\s*(?:!=|<>)\\s*true\\b`, 'gi');
      const notEqualsFalseRegex = new RegExp(`${booleanPattern}\\s*(?:!=|<>)\\s*false\\b`, 'gi');
      convertedQuery = convertedQuery.replace(equalsTrueRegex, '$1::integer = 1');
      convertedQuery = convertedQuery.replace(equalsFalseRegex, '$1::integer = 0');
      convertedQuery = convertedQuery.replace(notEqualsTrueRegex, '$1::integer != 1');
      convertedQuery = convertedQuery.replace(notEqualsFalseRegex, '$1::integer != 0');

      // Handle cases where true/false literals are used in other contexts
      // For example, in INSERT or UPDATE statements
      convertedQuery = convertedQuery.replace(/\b(VALUES\s*\([^)]*?),\s*true\b/gi, '$1, 1');
      convertedQuery = convertedQuery.replace(/\b(VALUES\s*\([^)]*?),\s*false\b/gi, '$1, 0');
      convertedQuery = convertedQuery.replace(/\bSET\s+([^=]+)\s*=\s*true\b/gi, 'SET $1 = 1');
      convertedQuery = convertedQuery.replace(/\bSET\s+([^=]+)\s*=\s*false\b/gi, 'SET $1 = 0');
      return convertedQuery;
    }
    async getTableInfo(tableName) {
      if (!this.tableInfoCache) {
        this.tableInfoCache = new Map();
      }

      // Check if we have cached info for this table
      if (this.tableInfoCache.has(tableName)) {
        return this.tableInfoCache.get(tableName);
      }
      try {
        // Query to get primary key column and if it's a serial/identity column
        const query = `
            SELECT 
                a.attname as column_name,
                format_type(a.atttypid, a.atttypmod) as data_type,
                pg_get_expr(d.adbin, d.adrelid) as default_value,
                a.attnotnull as not_null,
                (SELECT EXISTS (
                    SELECT 1 FROM pg_constraint c 
                    WHERE c.conrelid = a.attrelid 
                    AND c.conkey[1] = a.attnum 
                    AND c.contype = 'p'
                )) as is_primary_key
            FROM pg_attribute a
            LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
            WHERE a.attrelid = $1::regclass
            AND a.attnum > 0
            AND NOT a.attisdropped
            ORDER BY a.attnum
        `;
        const client = await this.pool.connect();
        const result = await client.query(query, [tableName]);
        client.release();
        const columns = {};
        let primaryKey = null;
        let hasIdentityColumn = false;
        for (const row of result.rows) {
          columns[row.column_name] = {
            dataType: row.data_type,
            notNull: row.not_null,
            isPrimaryKey: row.is_primary_key,
            defaultValue: row.default_value
          };

          // Check if this is a primary key with a default value (likely a serial/identity)
          if (row.is_primary_key && row.default_value) {
            primaryKey = row.column_name;
            // Check if default value contains nextval or similar sequence function
            if (row.default_value.includes('nextval') || row.default_value.includes('identity')) {
              hasIdentityColumn = true;
            }
          }
        }
        const tableInfo = {
          columns,
          primaryKey,
          hasIdentityColumn
        };

        // Cache the result
        this.tableInfoCache.set(tableName, tableInfo);
        return tableInfo;
      } catch (error) {
        console.error(`^6NEONDB: ^7Failed to get table info for ${tableName}:`, error.message);
        return {
          columns: {},
          primaryKey: null,
          hasIdentityColumn: false
        };
      }
    }
    async findSequenceForTable(tableName) {
      try {
        // Query to find sequences associated with a table's column
        const query = `
            SELECT pg_get_serial_sequence($1, 'id') AS sequence_name;
        `;
        const client = await this.pool.connect();
        const result = await client.query(query, [tableName]);
        client.release();
        if (result.rows && result.rows.length > 0 && result.rows[0].sequence_name) {
          return result.rows[0].sequence_name;
        }

        // If no sequence found, try a more general approach to find any sequence
        const fallbackQuery = `
            SELECT ns.nspname || '.' || seq.relname AS sequence_name
            FROM pg_class seq
            JOIN pg_namespace ns ON seq.relnamespace = ns.oid
            WHERE seq.relkind = 'S'
            AND seq.relname LIKE $1
            LIMIT 1;
        `;
        const client2 = await this.pool.connect();
        const result2 = await client2.query(fallbackQuery, [`%${tableName}%id%`]);
        client2.release();
        if (result2.rows && result2.rows.length > 0 && result2.rows[0].sequence_name) {
          return result2.rows[0].sequence_name;
        }
        return null;
      } catch (error) {
        console.error(`^6NEONDB: ^7Failed to find sequence for table ${tableName}:`, error.message);
        return null;
      }
    }
    async execute(query, parameters = [], callback = null) {
      if (!this.isReady) {
        const error = 'Database not ready';
        if (callback) callback(false, error);
        return Promise.reject(new Error(error));
      }
      const startTime = Date.now();
      const parsedParams = this.parseParameters(parameters);
      let convertedQuery = this.convertMySQLToPostgreSQL(query);

      // Only attempt to fix inventory_items INSERT queries
      if (convertedQuery.includes('INSERT INTO inventory_items') && !convertedQuery.includes('(id,') && !convertedQuery.includes('(id ')) {
        try {
          // Extract column list
          const columnMatch = convertedQuery.match(/\(([^)]+)\)/);
          if (columnMatch) {
            const columns = columnMatch[1].trim();

            // Check if this is a multi-row insert
            const isMultiRow = convertedQuery.includes('), (');
            if (isMultiRow) {
              // For multi-row inserts, we need to break it down into individual inserts
              // This is a simplified approach - parameters are grouped in sets of 7
              const rowSize = 7; // For inventory_items table
              const results = [];
              for (let i = 0; i < parsedParams.length; i += rowSize) {
                const rowParams = parsedParams.slice(i, i + rowSize);
                if (rowParams.length === rowSize) {
                  // Make sure we have a complete row
                  // Generate a unique ID for this row
                  const uniqueId = await this.getUniqueId('inventory_items');

                  // Create a query for this specific row
                  const singleInsertQuery = `
                                INSERT INTO inventory_items 
                                (id, name, label, description, inventory_identifier, slot, amount, metadata) 
                                VALUES 
                                ($1, $2, $3, $4, $5, $6, $7, $8)
                                RETURNING id
                            `;

                  // Add the ID as the first parameter
                  const rowParamsWithId = [uniqueId, ...rowParams];
                  const client = await this.pool.connect();
                  const result = await client.query(singleInsertQuery, rowParamsWithId);
                  client.release();
                  results.push({
                    id: result.rows[0].id,
                    affectedRows: result.rowCount
                  });
                }
              }

              // Create a combined result
              const response = {
                affectedRows: results.reduce((sum, item) => sum + item.affectedRows, 0),
                insertId: results.length > 0 ? results[0].id : null,
                warningCount: 0,
                changedRows: results.reduce((sum, item) => sum + item.affectedRows, 0),
                fieldCount: 0,
                serverStatus: 2,
                info: '',
                executionTime: Date.now() - startTime
              };
              console.log(`^2[oxpgsql] ^7Auto-fixed multi-row INSERT with ${results.length} individual inserts`);
              if (callback) callback(response);
              return response;
            } else {
              // For single-row inserts
              // Generate a unique ID
              const uniqueId = await this.getUniqueId('inventory_items');

              // Create a fixed query with the explicit ID
              const fixedQuery = `
                        INSERT INTO inventory_items 
                        (id, ${columns}) 
                        VALUES 
                        ($1, ${parsedParams.map((_, i) => `$${i + 2}`).join(', ')})
                        RETURNING id
                    `;

              // Add the ID as the first parameter
              const paramsWithId = [uniqueId, ...parsedParams];
              const client = await this.pool.connect();
              const result = await client.query(fixedQuery, paramsWithId);
              client.release();
              const response = {
                affectedRows: result.rowCount || 0,
                insertId: result.rows[0].id,
                warningCount: 0,
                changedRows: result.rowCount || 0,
                fieldCount: result.fields ? result.fields.length : 0,
                serverStatus: 2,
                info: '',
                executionTime: Date.now() - startTime
              };
              console.log(`^2[oxpgsql] ^7Auto-fixed inventory_items INSERT query with ID ${uniqueId}`);
              if (callback) callback(response);
              return response;
            }
          }
        } catch (fixError) {
          console.error('^1[oxpgsql] ^7Failed to fix INSERT query:', fixError.message);
          // Continue to try the original query
        }
      }
      try {
        const client = await this.pool.connect();
        const result = await client.query(convertedQuery, parsedParams);
        client.release();
        const executionTime = Date.now() - startTime;
        this.queryCount++;
        if (executionTime > this.slowQueryThreshold) {
          console.warn(`^3[oxpgsql] ^7Slow query detected (${executionTime}ms):`, convertedQuery.substring(0, 100));
        }
        const response = {
          affectedRows: result.rowCount || 0,
          insertId: this.getInsertId(result),
          warningCount: 0,
          changedRows: result.rowCount || 0,
          fieldCount: result.fields ? result.fields.length : 0,
          serverStatus: 2,
          info: '',
          executionTime: executionTime
        };
        if (callback) callback(response);
        return response;
      } catch (error) {
        console.error('^1[oxpgsql] ^7Execute error:', error.message);
        console.error('^1[oxpgsql] ^7Query:', convertedQuery);

        // Handle ID constraint violation as a last resort
        if (error.message.includes('violates not-null constraint') && error.message.includes('column "id"') && convertedQuery.includes('INSERT INTO inventory_items')) {
          try {
            // Generate a unique random ID in a higher range to avoid conflicts
            const uniqueId = Math.floor(10000000 + Math.random() * 89999999);

            // Create a completely new query with explicit column names
            const lastResortQuery = `
                    INSERT INTO inventory_items 
                    (id, name, label, description, inventory_identifier, slot, amount, metadata) 
                    VALUES 
                    ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING id
                `;

            // Add the ID as the first parameter
            const lastResortParams = [uniqueId, ...parsedParams];
            const client = await this.pool.connect();
            const result = await client.query(lastResortQuery, lastResortParams);
            client.release();
            const response = {
              affectedRows: result.rowCount || 0,
              insertId: result.rows[0].id,
              warningCount: 0,
              changedRows: result.rowCount || 0,
              fieldCount: result.fields ? result.fields.length : 0,
              serverStatus: 2,
              info: '',
              executionTime: Date.now() - startTime
            };
            console.log(`^2[oxpgsql] ^7Last resort fix for inventory_items INSERT with ID ${uniqueId}`);
            if (callback) callback(response);
            return response;
          } catch (lastError) {
            console.error('^1[oxpgsql] ^7All attempts to fix INSERT query failed:', lastError.message);
          }
        } else if (error.message.includes('duplicate key value violates unique constraint')) {
          // Handle duplicate key errors by retrying with a different ID
          try {
            // Generate a unique ID in a much higher range to avoid conflicts
            const uniqueId = Math.floor(50000000 + Math.random() * 49999999);
            if (convertedQuery.includes('INSERT INTO inventory_items')) {
              // Extract column list
              const columnMatch = convertedQuery.match(/\(([^)]+)\)/);
              if (columnMatch) {
                const columns = columnMatch[1].trim();
                const retryQuery = `
                            INSERT INTO inventory_items 
                            (id, ${columns}) 
                            VALUES 
                            ($1, ${parsedParams.map((_, i) => `$${i + 2}`).join(', ')})
                            RETURNING id
                        `;
                const retryParams = [uniqueId, ...parsedParams];
                const client = await this.pool.connect();
                const result = await client.query(retryQuery, retryParams);
                client.release();
                const response = {
                  affectedRows: result.rowCount || 0,
                  insertId: result.rows[0].id,
                  warningCount: 0,
                  changedRows: result.rowCount || 0,
                  fieldCount: result.fields ? result.fields.length : 0,
                  serverStatus: 2,
                  info: '',
                  executionTime: Date.now() - startTime
                };
                console.log(`^2[oxpgsql] ^7Retry after duplicate key with ID ${uniqueId}`);
                if (callback) callback(response);
                return response;
              }
            }
          } catch (retryError) {
            console.error('^1[oxpgsql] ^7Failed to retry after duplicate key:', retryError.message);
          }
        }
        if (callback) callback(false, error.message);
        return Promise.reject(error);
      }
    }
    async execute(query, parameters = [], callback = null) {
      if (!this.isReady) {
        const error = 'Database not ready';
        if (callback) callback(false, error);
        return Promise.reject(new Error(error));
      }
      const startTime = Date.now();
      const parsedParams = this.parseParameters(parameters);
      let convertedQuery = this.convertMySQLToPostgreSQL(query);

      // Only attempt to fix inventory_items INSERT queries
      if (convertedQuery.includes('INSERT INTO inventory_items') && !convertedQuery.includes('(id,') && !convertedQuery.includes('(id ')) {
        try {
          // Extract column list
          const columnMatch = convertedQuery.match(/\(([^)]+)\)/);
          if (columnMatch) {
            const columns = columnMatch[1].trim();

            // Check if this is a multi-row insert
            const isMultiRow = convertedQuery.includes('), (');
            if (isMultiRow) {
              // For multi-row inserts, we need to break it down into individual inserts
              // This is a simplified approach - parameters are grouped in sets of 7
              const rowSize = 7; // For inventory_items table
              const results = [];
              for (let i = 0; i < parsedParams.length; i += rowSize) {
                const rowParams = parsedParams.slice(i, i + rowSize);
                if (rowParams.length === rowSize) {
                  // Make sure we have a complete row
                  // Generate a unique ID for this row
                  const uniqueId = await this.getUniqueId('inventory_items');

                  // Create a query for this specific row
                  const singleInsertQuery = `
                                INSERT INTO inventory_items 
                                (id, name, label, description, inventory_identifier, slot, amount, metadata) 
                                VALUES 
                                ($1, $2, $3, $4, $5, $6, $7, $8)
                                RETURNING id
                            `;

                  // Add the ID as the first parameter
                  const rowParamsWithId = [uniqueId, ...rowParams];
                  const client = await this.pool.connect();
                  const result = await client.query(singleInsertQuery, rowParamsWithId);
                  client.release();
                  results.push({
                    id: result.rows[0].id,
                    affectedRows: result.rowCount
                  });
                }
              }

              // Create a combined result
              const response = {
                affectedRows: results.reduce((sum, item) => sum + item.affectedRows, 0),
                insertId: results.length > 0 ? results[0].id : null,
                warningCount: 0,
                changedRows: results.reduce((sum, item) => sum + item.affectedRows, 0),
                fieldCount: 0,
                serverStatus: 2,
                info: '',
                executionTime: Date.now() - startTime
              };
              console.log(`^2[oxpgsql] ^7Auto-fixed multi-row INSERT with ${results.length} individual inserts`);
              if (callback) callback(response);
              return response;
            } else {
              // For single-row inserts
              // Generate a unique ID
              const uniqueId = await this.getUniqueId('inventory_items');

              // Create a fixed query with the explicit ID
              const fixedQuery = `
                        INSERT INTO inventory_items 
                        (id, ${columns}) 
                        VALUES 
                        ($1, ${parsedParams.map((_, i) => `$${i + 2}`).join(', ')})
                        RETURNING id
                    `;

              // Add the ID as the first parameter
              const paramsWithId = [uniqueId, ...parsedParams];
              const client = await this.pool.connect();
              const result = await client.query(fixedQuery, paramsWithId);
              client.release();
              const response = {
                affectedRows: result.rowCount || 0,
                insertId: result.rows[0].id,
                warningCount: 0,
                changedRows: result.rowCount || 0,
                fieldCount: result.fields ? result.fields.length : 0,
                serverStatus: 2,
                info: '',
                executionTime: Date.now() - startTime
              };
              console.log(`^2[oxpgsql] ^7Auto-fixed inventory_items INSERT query with ID ${uniqueId}`);
              if (callback) callback(response);
              return response;
            }
          }
        } catch (fixError) {
          console.error('^1[oxpgsql] ^7Failed to fix INSERT query:', fixError.message);
          // Continue to try the original query
        }
      }
      try {
        const client = await this.pool.connect();
        const result = await client.query(convertedQuery, parsedParams);
        client.release();
        const executionTime = Date.now() - startTime;
        this.queryCount++;
        if (executionTime > this.slowQueryThreshold) {
          console.warn(`^3[oxpgsql] ^7Slow query detected (${executionTime}ms):`, convertedQuery.substring(0, 100));
        }
        const response = {
          affectedRows: result.rowCount || 0,
          insertId: this.getInsertId(result),
          warningCount: 0,
          changedRows: result.rowCount || 0,
          fieldCount: result.fields ? result.fields.length : 0,
          serverStatus: 2,
          info: '',
          executionTime: executionTime
        };
        if (callback) callback(response);
        return response;
      } catch (error) {
        console.error('^1[oxpgsql] ^7Execute error:', error.message);
        console.error('^1[oxpgsql] ^7Query:', convertedQuery);

        // Handle ID constraint violation as a last resort
        if (error.message.includes('violates not-null constraint') && error.message.includes('column "id"') && convertedQuery.includes('INSERT INTO inventory_items')) {
          try {
            // Generate a unique random ID in a higher range to avoid conflicts
            const uniqueId = Math.floor(10000000 + Math.random() * 89999999);

            // Create a completely new query with explicit column names
            const lastResortQuery = `
                    INSERT INTO inventory_items 
                    (id, name, label, description, inventory_identifier, slot, amount, metadata) 
                    VALUES 
                    ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING id
                `;

            // Add the ID as the first parameter
            const lastResortParams = [uniqueId, ...parsedParams];
            const client = await this.pool.connect();
            const result = await client.query(lastResortQuery, lastResortParams);
            client.release();
            const response = {
              affectedRows: result.rowCount || 0,
              insertId: result.rows[0].id,
              warningCount: 0,
              changedRows: result.rowCount || 0,
              fieldCount: result.fields ? result.fields.length : 0,
              serverStatus: 2,
              info: '',
              executionTime: Date.now() - startTime
            };
            console.log(`^2[oxpgsql] ^7Last resort fix for inventory_items INSERT with ID ${uniqueId}`);
            if (callback) callback(response);
            return response;
          } catch (lastError) {
            console.error('^1[oxpgsql] ^7All attempts to fix INSERT query failed:', lastError.message);
          }
        } else if (error.message.includes('duplicate key value violates unique constraint')) {
          // Handle duplicate key errors by retrying with a different ID
          try {
            // Generate a unique ID in a much higher range to avoid conflicts
            const uniqueId = Math.floor(50000000 + Math.random() * 49999999);
            if (convertedQuery.includes('INSERT INTO inventory_items')) {
              // Extract column list
              const columnMatch = convertedQuery.match(/\(([^)]+)\)/);
              if (columnMatch) {
                const columns = columnMatch[1].trim();
                const retryQuery = `
                            INSERT INTO inventory_items 
                            (id, ${columns}) 
                            VALUES 
                            ($1, ${parsedParams.map((_, i) => `$${i + 2}`).join(', ')})
                            RETURNING id
                        `;
                const retryParams = [uniqueId, ...parsedParams];
                const client = await this.pool.connect();
                const result = await client.query(retryQuery, retryParams);
                client.release();
                const response = {
                  affectedRows: result.rowCount || 0,
                  insertId: result.rows[0].id,
                  warningCount: 0,
                  changedRows: result.rowCount || 0,
                  fieldCount: result.fields ? result.fields.length : 0,
                  serverStatus: 2,
                  info: '',
                  executionTime: Date.now() - startTime
                };
                console.log(`^2[oxpgsql] ^7Retry after duplicate key with ID ${uniqueId}`);
                if (callback) callback(response);
                return response;
              }
            }
          } catch (retryError) {
            console.error('^1[oxpgsql] ^7Failed to retry after duplicate key:', retryError.message);
          }
        }
        if (callback) callback(false, error.message);
        return Promise.reject(error);
      }
    }
    async rawExecute(query, parameters = [], callback = null) {
      if (!this.isReady) {
        const error = 'Database not ready';
        if (callback) callback(false, error);
        return Promise.reject(new Error(error));
      }
      const startTime = Date.now();
      const parsedParams = this.parseParameters(parameters);
      try {
        const client = await this.pool.connect();
        const result = await client.query(query, parsedParams);
        client.release();
        const executionTime = Date.now() - startTime;
        this.queryCount++;
        const response = {
          affectedRows: result.rowCount || 0,
          insertId: this.getInsertId(result),
          warningCount: 0,
          changedRows: result.rowCount || 0,
          fieldCount: result.fields ? result.fields.length : 0,
          serverStatus: 2,
          info: '',
          executionTime: executionTime
        };
        if (callback) callback(response);
        return response;
      } catch (error) {
        console.error('^6NEONDB: ^7Raw execute error:', error.message);
        if (callback) callback(false, error.message);
        return Promise.reject(error);
      }
    }
    async query(query, parameters = [], callback = null) {
      if (!this.isReady) {
        const error = 'Database not ready';
        if (callback) callback([]);
        return Promise.reject(new Error(error));
      }
      const startTime = Date.now();
      const parsedParams = this.parseParameters(parameters);
      const convertedQuery = this.convertMySQLToPostgreSQL(query);
      try {
        const client = await this.pool.connect();
        const result = await client.query(convertedQuery, parsedParams);
        client.release();
        const executionTime = Date.now() - startTime;
        this.queryCount++;
        if (executionTime > this.slowQueryThreshold) {
          console.warn(`^6NEONDB: ^7Slow query detected (${executionTime}ms):`, convertedQuery.substring(0, 100));
        }
        if (this.debugMode) {
          console.log(`^6NEONDB: ^7Query executed in ${executionTime}ms:`, convertedQuery.substring(0, 100));
        }
        const rows = result.rows || [];
        if (callback) callback(rows);
        return rows;
      } catch (error) {
        console.error('^6NEONDB: ^7Query error:', error.message);
        console.error('^6NEONDB: ^7Query:', convertedQuery);
        console.error('^6NEONDB: ^7Parameters:', parsedParams);
        if (callback) callback([]);
        return Promise.reject(error);
      }
    }
    async rawQuery(query, parameters = [], callback = null) {
      if (!this.isReady) {
        const error = 'Database not ready';
        if (callback) callback([]);
        return Promise.reject(new Error(error));
      }
      const startTime = Date.now();
      const parsedParams = this.parseParameters(parameters);
      try {
        const client = await this.pool.connect();
        const result = await client.query(query, parsedParams);
        client.release();
        const executionTime = Date.now() - startTime;
        this.queryCount++;
        const rows = result.rows || [];
        if (callback) callback(rows);
        return rows;
      } catch (error) {
        console.error('^6NEONDB: ^7Raw query error:', error.message);
        if (callback) callback([]);
        return Promise.reject(error);
      }
    }
    async single(query, parameters = [], callback = null) {
      try {
        const result = await this.query(query, parameters);
        const row = result.length > 0 ? result[0] : null;
        if (callback) callback(row);
        return row;
      } catch (error) {
        if (callback) callback(null);
        return Promise.reject(error);
      }
    }
    async scalar(query, parameters = [], callback = null) {
      try {
        const result = await this.single(query, parameters);
        if (result) {
          const firstKey = Object.keys(result)[0];
          const value = result[firstKey];
          if (callback) callback(value);
          return value;
        }
        if (callback) callback(null);
        return null;
      } catch (error) {
        if (callback) callback(null);
        return Promise.reject(error);
      }
    }
    async insert(query, parameters = [], callback = null) {
      try {
        let modifiedQuery = query;

        // Make sure RETURNING id is added
        if (!modifiedQuery.toLowerCase().includes('returning')) {
          modifiedQuery += ' RETURNING id';
        }
        const result = await this.execute(modifiedQuery, parameters);
        const insertId = result.insertId;
        if (callback) callback(insertId);
        return insertId;
      } catch (error) {
        // Special handling for ID constraint violation
        if (error.message && error.message.includes('violates not-null constraint') && error.message.includes('column "id"')) {
          try {
            const tableNameMatch = query.match(/^\s*INSERT\s+INTO\s+([^\s(]+)/i);
            if (tableNameMatch) {
              const tableName = tableNameMatch[1].replace(/"/g, '').replace(/`/g, '');

              // First, get the maximum ID from the table
              const client = await this.pool.connect();
              const maxIdResult = await client.query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM ${tableName}`);
              const nextId = maxIdResult.rows[0].next_id;

              // Extract column list
              const columnMatch = query.match(/\(([^)]+)\)/);
              if (columnMatch) {
                const columns = columnMatch[1].trim();

                // Create a new query with explicit ID
                const modifiedQuery = `
                            INSERT INTO ${tableName} 
                            (id, ${columns}) 
                            VALUES 
                            (${nextId}, ${this.parseParameters(parameters).map((_, i) => `$${i + 1}`).join(', ')})
                            RETURNING id
                        `;
                const result = await client.query(modifiedQuery, this.parseParameters(parameters));
                client.release();
                const insertId = result.rows[0].id || nextId;
                console.log(`^6NEONDB: ^7Auto-fixed INSERT query using MAX(id)+1 = ${nextId}`);
                if (callback) callback(insertId);
                return insertId;
              }
            }
          } catch (retryError) {
            console.error('^6NEONDB: ^7Failed to auto-fix INSERT query:', retryError.message);
          }
        }
        if (callback) callback(false);
        return Promise.reject(error);
      }
    }
    async update(query, parameters = [], callback = null) {
      try {
        const result = await this.execute(query, parameters);
        const affectedRows = result.affectedRows;
        if (callback) callback(affectedRows);
        return affectedRows;
      } catch (error) {
        if (callback) callback(false);
        return Promise.reject(error);
      }
    }
    async prepare(name, query, callback = null) {
      try {
        const convertedQuery = this.convertMySQLToPostgreSQL(query);
        this.preparedStatements.set(name, convertedQuery);
        if (callback) callback(true);
        return true;
      } catch (error) {
        console.error('^6NEONDB: ^7Prepare error:', error.message);
        if (callback) callback(false);
        return Promise.reject(error);
      }
    }
    async transaction(queries, callback = null) {
      if (!this.isReady) {
        const error = 'Database not ready';
        if (callback) callback(false, error);
        return Promise.reject(new Error(error));
      }
      const client = await this.pool.connect();
      const results = [];
      try {
        await client.query('BEGIN');
        for (const queryData of queries) {
          let query, parameters;
          if (typeof queryData === 'string') {
            query = queryData;
            parameters = [];
          } else if (Array.isArray(queryData)) {
            query = queryData[0];
            parameters = queryData[1] || [];
          } else {
            query = queryData.query;
            parameters = queryData.parameters || [];
          }
          const convertedQuery = this.convertMySQLToPostgreSQL(query);
          const parsedParams = this.parseParameters(parameters);
          const result = await client.query(convertedQuery, parsedParams);
          results.push({
            affectedRows: result.rowCount || 0,
            insertId: this.getInsertId(result),
            warningCount: 0,
            changedRows: result.rowCount || 0
          });
        }
        await client.query('COMMIT');
        client.release();
        if (callback) callback(results);
        return results;
      } catch (error) {
        await client.query('ROLLBACK');
        client.release();
        console.error('^6NEONDB: ^7Transaction error:', error.message);
        if (callback) callback(false, error.message);
        return Promise.reject(error);
      }
    }
    async store(name, query, parameters = [], callback = null) {
      try {
        this.preparedStatements.set(name, {
          query: this.convertMySQLToPostgreSQL(query),
          parameters: this.parseParameters(parameters)
        });
        if (callback) callback(true);
        return true;
      } catch (error) {
        console.error('^6NEONDB: ^7Store error:', error.message);
        if (callback) callback(false);
        return Promise.reject(error);
      }
    }
    getBooleanColumnPatterns() {
      return ['enabled', 'enable', 'disabled', 'disable', 'active', 'inactive', 'is_active', 'is_enabled', 'visible', 'hidden', 'is_visible', 'is_hidden', 'online', 'offline', 'is_online', 'banned', 'is_banned', 'locked', 'is_locked', 'verified', 'is_verified', 'approved', 'is_approved', 'deleted', 'is_deleted', 'archived', 'is_archived', 'public', 'private', 'is_public', 'is_private', 'for_sale', 'available', 'is_available', 'completed', 'is_completed', 'finished', 'is_finished'];
    }
    getInsertId(result) {
      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        // Check for common ID column names
        if (row.id !== undefined) return row.id;
        if (row.ID !== undefined) return row.ID;
        if (row.Id !== undefined) return row.Id;
        if (row.insertid !== undefined) return row.insertid;
        if (row.insertId !== undefined) return row.insertId;
        if (row.insert_id !== undefined) return row.insert_id;
        if (row.lastval !== undefined) return row.lastval;

        // If we can't find a specific ID column, return the first column's value
        const firstKey = Object.keys(row)[0];
        return row[firstKey];
      }
      return null;
    }
    ready(callback = null) {
      if (callback) {
        if (this.isReady) {
          callback(true);
        } else {
          const checkReady = () => {
            if (this.isReady) {
              callback(true);
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        }
      }
      return this.isReady;
    }
    getStatus() {
      return {
        ready: this.isReady,
        queryCount: this.queryCount,
        poolSize: this.pool ? this.pool.totalCount : 0,
        idleConnections: this.pool ? this.pool.idleCount : 0,
        waitingClients: this.pool ? this.pool.waitingCount : 0
      };
    }
  }

  // Initialize the database
  const oxpgsql = new OxPgSQL();

  // Export functions
  global.exports('execute', (query, parameters, callback) => {
    oxpgsql.execute(query, parameters, callback);
  });
  global.exports('query', (query, parameters, callback) => {
    oxpgsql.query(query, parameters, callback);
  });
  global.exports('single', (query, parameters, callback) => {
    oxpgsql.single(query, parameters, callback);
  });
  global.exports('scalar', (query, parameters, callback) => {
    oxpgsql.scalar(query, parameters, callback);
  });
  global.exports('insert', (query, parameters, callback) => {
    oxpgsql.insert(query, parameters, callback);
  });
  global.exports('update', (query, parameters, callback) => {
    oxpgsql.update(query, parameters, callback);
  });
  global.exports('prepare', (name, query, callback) => {
    oxpgsql.prepare(name, query, callback);
  });
  global.exports('transaction', (queries, callback) => {
    oxpgsql.transaction(queries, callback);
  });
  global.exports('ready', callback => {
    oxpgsql.ready(callback);
  });
  global.exports('rawExecute', (query, parameters, callback) => {
    oxpgsql.rawExecute(query, parameters, callback);
  });
  global.exports('rawQuery', (query, parameters, callback) => {
    oxpgsql.rawQuery(query, parameters, callback);
  });
  global.exports('store', (name, query, parameters, callback) => {
    oxpgsql.store(name, query, parameters, callback);
  });
  global.exports('parseParameters', parameters => {
    return oxpgsql.parseParameters(parameters);
  });

  // Status command
  RegisterCommand('oxpgsql:status', () => {
    const status = oxpgsql.getStatus();
    console.log('^6NEONDB: ^7Status:', JSON.stringify(status, null, 2));
  }, true);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('^6NEONDB: ^7Shutting down gracefully...');
    if (oxpgsql.pool) {
      await oxpgsql.pool.end();
    }
    process.exit(0);
  });
  function fixBooleanQuery(query) {
    // Replace integer comparisons with boolean comparisons
    return query.replace(/\b(\w+)\s*=\s*1\b(?!\d)/g, '$1 = true').replace(/\b(\w+)\s*=\s*0\b(?!\d)/g, '$1 = false');
  }
  console.log('^6NEONDB: ^7PostgreSQL wrapper loaded - waiting for database connection...');
  module.exports = __webpack_exports__;
  /******/
})()
  ;