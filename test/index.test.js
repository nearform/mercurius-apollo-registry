'use strict'

const { test } = require('node:test')

const Fastify = require('fastify')
const fp = require('fastify-plugin')
const sinon = require('sinon')
const faker = require('faker')
const nock = require('nock')

const plugin = require('../')
const { initialQuery, reportQuery } = require('../lib/queries')

const RETRY_TIMEOUT = 20

const clock = sinon.useFakeTimers()

function makeStubMercurius() {
  return fp(async () => {}, {
    name: 'mercurius'
  })
}

test('plugin registration', async (t) => {
  let fastifyContext
  let pluginContext

  const registryUrl = faker.internet.url()

  t.beforeEach(async () => {
    nock.disableNetConnect()

    nock(registryUrl)
      .post()
      .reply(200, {
        me: {
          reportServerInfo: {
            inSeconds: 180,
            withExecutableSchema: false
          }
        }
      })

    const fastify = Fastify()

    fastify.register(makeStubMercurius())

    fastifyContext = fastify
    pluginContext = plugin
  })

  t.afterEach(() => fastifyContext.close.bind(fastifyContext))

  await t.test('plugin should exist and load without error', async (t) => {
    fastifyContext.register(pluginContext, {
      apiKey: faker.datatype.uuid(),
      schema: faker.lorem.paragraph(),
      registryUrl: faker.internet.url()
    })

    return fastifyContext.ready()
  })

  await t.test(
    'plugin should throw an error if schema is missing',
    async (t) => {
      fastifyContext.register(pluginContext, {
        apiKey: faker.datatype.uuid(),
        registryUrl: faker.internet.url()
      })

      return t.assert.rejects(
        () => fastifyContext.ready(),
        new Error('a schema string is required')
      )
    }
  )

  await t.test(
    'plugin should throw an error if schema is missing',
    async (t) => {
      fastifyContext.register(pluginContext, {
        apiKey: faker.datatype.uuid(),
        registryUrl: faker.internet.url(),
        schema: ''
      })

      return t.assert.rejects(
        () => fastifyContext.ready(),
        new Error('a schema string is required')
      )
    }
  )

  await t.test(
    'plugin should throw an error if api key is missing',
    async (t) => {
      fastifyContext.register(pluginContext, {
        schema: faker.lorem.paragraph(),
        registryUrl: faker.internet.url()
      })

      return t.assert.rejects(
        () => fastifyContext.ready(),
        new Error('an Apollo Studio API key is required')
      )
    }
  )

  await t.test('registryUrl should be optional', async (t) => {
    fastifyContext.register(pluginContext, {
      apiKey: faker.datatype.uuid(),
      schema: faker.lorem.paragraph()
    })

    return fastifyContext.ready()
  })
})

test('apollo registry api requests', async (t) => {
  let fastifyContext
  let opts

  t.beforeEach(async () => {
    const fastify = Fastify()
    fastify.register(makeStubMercurius())

    fastifyContext = fastify
    opts = {
      apiKey: faker.datatype.uuid(),
      schema: faker.lorem.paragraph(),
      registryUrl: faker.internet.url()
    }
  })

  t.afterEach(() => fastifyContext.close.bind(fastifyContext))

  await t.test(
    'invokes the api with executableSchema false and the initial query',
    async (t) => {
      const REGISTRY_TIMEOUT = 60
      let requestBody
      let requestHeaders

      const scope = nock(opts.registryUrl)
        .post('/')
        .reply(function (uri, body) {
          requestBody = body
          requestHeaders = this.req.headers
          return [
            200,
            {
              data: {
                me: {
                  reportServerInfo: {
                    inSeconds: REGISTRY_TIMEOUT,
                    withExecutableSchema: true
                  }
                }
              }
            }
          ]
        })

      fastifyContext.register(plugin, opts)

      await fastifyContext.ready()
      await new Promise((resolve) => scope.once('replied', resolve))

      t.assert.strictEqual(requestHeaders['x-api-key'], opts.apiKey)

      sinon.assert.match(requestBody, {
        query: initialQuery,
        variables: {
          executableSchema: false,
          info: sinon.match.object
        }
      })
    }
  )

  await t.test(
    'runs the next iteration only when the inSeconds from the response have elapsed',
    async (t) => {
      const REGISTRY_TIMEOUT = 60
      let callCount = 0
      let secondRequestBody
      let secondRequestHeaders

      const scope = nock(opts.registryUrl)
        .post('/')
        .times(2)
        .reply(function (uri, body) {
          callCount++
          if (callCount === 2) {
            secondRequestBody = body
            secondRequestHeaders = this.req.headers
          }
          return [
            200,
            {
              data: {
                me: {
                  reportServerInfo: {
                    inSeconds: REGISTRY_TIMEOUT,
                    withExecutableSchema: true
                  }
                }
              }
            }
          ]
        })

      fastifyContext.register(plugin, opts)

      await fastifyContext.ready()
      await new Promise((resolve) => scope.once('replied', resolve))

      t.assert.strictEqual(callCount, 1)

      // advance time by REGISTRY_TIMEOUT - 2 seconds
      await clock.tickAsync((REGISTRY_TIMEOUT - 2) * 1000)
      t.assert.strictEqual(callCount, 1)

      // advance time to REGISTRY_TIMEOUT
      await clock.tickAsync(REGISTRY_TIMEOUT * 1000)
      await new Promise((resolve) => scope.once('replied', resolve))
      t.assert.strictEqual(callCount, 2)

      t.assert.strictEqual(secondRequestHeaders['x-api-key'], opts.apiKey)

      sinon.assert.match(secondRequestBody, {
        query: reportQuery,
        variables: {
          executableSchema: opts.schema,
          info: sinon.match.object
        }
      })
    }
  )

  await t.test(
    'runs the next iteration sooner than the MAX_TIMEOUT reported by the registry',
    async (t) => {
      // 24 Hour timeout
      const REGISTRY_TIMEOUT = 86400
      let callCount = 0
      let secondRequestBody

      const scope = nock(opts.registryUrl)
        .post('/')
        .times(2)
        .reply(function (uri, body) {
          callCount++
          if (callCount === 2) {
            secondRequestBody = body
          }
          return [
            200,
            {
              data: {
                me: {
                  reportServerInfo: {
                    inSeconds: REGISTRY_TIMEOUT,
                    withExecutableSchema: false
                  }
                }
              }
            }
          ]
        })

      fastifyContext.register(plugin, opts)

      await fastifyContext.ready()
      await new Promise((resolve) => scope.once('replied', resolve))

      // initial call to registry
      t.assert.strictEqual(callCount, 1)

      // advance time to after RETRY_TIMEOUT
      await clock.tickAsync((RETRY_TIMEOUT + 10) * 1000)
      await new Promise((resolve) => scope.once('replied', resolve))
      t.assert.strictEqual(callCount, 2)

      sinon.assert.match(secondRequestBody, {
        query: initialQuery,
        variables: {
          executableSchema: false,
          info: sinon.match.object
        }
      })
    }
  )

  await t.test(
    'plugin retries after a failed registry request (non 200)',
    async (t) => {
      let callCount = 0

      const scope = nock(opts.registryUrl)
        .post('/')
        .times(2)
        .reply(function () {
          callCount++
          return [500, 'Internal Server Error']
        })

      fastifyContext.register(plugin, opts)

      await fastifyContext.ready()
      await new Promise((resolve) => scope.once('replied', resolve))

      // Initial call made?
      t.assert.strictEqual(callCount, 1)

      // advance time by RETRY_TIMEOUT - 2 seconds
      await clock.tickAsync((RETRY_TIMEOUT - 2) * 1000)
      t.assert.strictEqual(callCount, 1)

      // advance time to after RETRY_TIMEOUT
      await clock.tickAsync(RETRY_TIMEOUT * 1000)
      t.assert.strictEqual(callCount, 2)
    }
  )

  await t.test(
    'plugin retries after a malformed registry response',
    async (t) => {
      let callCount = 0

      const scope = nock(opts.registryUrl)
        .post('/')
        .times(2)
        .reply(function () {
          callCount++
          return [200, { foo: 'bar' }]
        })

      fastifyContext.register(plugin, opts)

      await fastifyContext.ready()
      await new Promise((resolve) => scope.once('replied', resolve))

      // Initial call made?
      t.assert.strictEqual(callCount, 1)

      // advance time by RETRY_TIMEOUT - 2 seconds
      await clock.tickAsync((RETRY_TIMEOUT - 2) * 1000)
      t.assert.strictEqual(callCount, 1)

      // advance time to after RETRY_TIMEOUT
      await clock.tickAsync(RETRY_TIMEOUT * 1000)
      await new Promise((resolve) => scope.once('replied', resolve))
      t.assert.strictEqual(callCount, 2)
    }
  )

  await t.test(
    'plugin retries after an unknown registry response',
    async (t) => {
      let callCount = 0

      const scope = nock(opts.registryUrl)
        .post('/')
        .times(2)
        .reply(function () {
          callCount++
          return [
            200,
            {
              data: {
                me: {
                  foo: 'bar'
                }
              }
            }
          ]
        })

      fastifyContext.register(plugin, opts)

      await fastifyContext.ready()
      await new Promise((resolve) => scope.once('replied', resolve))

      // Initial call made?
      t.assert.strictEqual(callCount, 1)

      // advance time by RETRY_TIMEOUT - 2 seconds
      await clock.tickAsync((RETRY_TIMEOUT - 2) * 1000)
      t.assert.strictEqual(callCount, 1)

      // advance time to after RETRY_TIMEOUT
      await clock.tickAsync(RETRY_TIMEOUT * 1000)
      await new Promise((resolve) => scope.once('replied', resolve))
      t.assert.strictEqual(callCount, 2)
    }
  )
})
