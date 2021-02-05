const tap = require('tap')
const test = tap.test
const Fastify = require('fastify')
const fp = require('fastify-plugin')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const faker = require('faker')

const { initialQuery, reportQuery } = require('../lib/queries')

const RETRY_TIMEOUT = 20

const clock = sinon.useFakeTimers()

function makeStubMercurius() {
  return fp(async () => {}, {
    name: 'mercurius'
  })
}

test('plugin registration', async (t) => {
  t.beforeEach(async () => {
    const fetchMock = sinon.stub().resolves({
      ok: true,
      json: sinon.stub().resolves({
        data: {
          me: {
            reportServerInfo: {
              inSeconds: 180,
              withExecutableSchema: false
            }
          }
        }
      })
    })

    const plugin = proxyquire('../', { 'node-fetch': fetchMock })

    const fastify = Fastify()

    fastify.register(makeStubMercurius())

    t.context.fastify = fastify
    t.context.plugin = plugin
  })

  t.afterEach(async () => {
    return t.tearDown(t.context.fastify.close.bind(t.context.fastify))
  })

  t.test('plugin should exist and load without error', async (t) => {
    const { fastify, plugin } = t.context

    fastify.register(plugin, {
      apiKey: faker.random.uuid(),
      schema: faker.lorem.paragraph(),
      registryUrl: faker.internet.url()
    })

    return fastify.ready()
  })

  t.test('plugin should throw an error if schema is missing', async (t) => {
    const { fastify, plugin } = t.context

    fastify.register(plugin, {
      apiKey: faker.random.uuid(),
      registryUrl: faker.internet.url()
    })

    return t.rejects(() => fastify.ready(), 'a schema string is required')
  })

  t.test('plugin should throw an error if schema is missing', async (t) => {
    const { fastify, plugin } = t.context

    fastify.register(plugin, {
      apiKey: faker.random.uuid(),
      registryUrl: faker.internet.url(),
      schema: ''
    })

    return t.rejects(() => fastify.ready(), 'a schema string is required')
  })

  t.test('plugin should throw an error if api key is missing', async (t) => {
    const { fastify, plugin } = t.context

    fastify.register(plugin, {
      schema: faker.lorem.paragraph(),
      registryUrl: faker.internet.url()
    })

    return t.rejects(
      () => fastify.ready(),
      'an Apollo Studio API key is required'
    )
  })

  t.test('registryUrl should be optional', async (t) => {
    const { fastify, plugin } = t.context

    fastify.register(plugin, {
      apiKey: faker.random.uuid(),
      schema: faker.lorem.paragraph()
    })

    return fastify.ready()
  })
})

test('apollo registry api requests', async (t) => {
  t.beforeEach(async () => {
    const fastify = Fastify()
    fastify.register(makeStubMercurius())

    t.context.fastify = fastify
    t.context.opts = {
      apiKey: faker.random.uuid(),
      schema: faker.lorem.paragraph(),
      registryUrl: faker.internet.url()
    }
  })

  t.afterEach(async () => {
    return t.tearDown(t.context.fastify.close.bind(t.context.fastify))
  })

  t.test(
    'invokes the api with executableSchema false and the initial query',
    async (t) => {
      const { fastify, opts } = t.context

      const REGISTRY_TIMEOUT = 60
      const fetchMock = sinon.stub().resolves({
        ok: true,
        json: sinon.stub().resolves({
          data: {
            me: {
              reportServerInfo: {
                inSeconds: REGISTRY_TIMEOUT,
                withExecutableSchema: true
              }
            }
          }
        })
      })

      const plugin = proxyquire('../', { 'node-fetch': fetchMock })
      fastify.register(plugin, opts)

      await fastify.ready()

      const requestInit = fetchMock.getCalls()[0].args[1]

      sinon.assert.match(requestInit.headers, { 'x-api-key': opts.apiKey })

      const parsedBody = JSON.parse(requestInit.body)

      sinon.assert.match(parsedBody, {
        query: initialQuery,
        variables: {
          executableSchema: false,
          info: sinon.match.object
        }
      })
    }
  )

  t.test(
    'runs the next iteration only when the inSeconds from the response have elapsed',
    async (t) => {
      const { fastify, opts } = t.context

      const REGISTRY_TIMEOUT = 60

      const fetchMock = sinon.stub().resolves({
        ok: true,
        json: sinon.stub().resolves({
          data: {
            me: {
              reportServerInfo: {
                inSeconds: REGISTRY_TIMEOUT,
                withExecutableSchema: true
              }
            }
          }
        })
      })

      const plugin = proxyquire('../', { 'node-fetch': fetchMock })
      fastify.register(plugin, opts)

      await fastify.ready()

      t.equal(fetchMock.getCalls().length, 1)

      // advance time by REGISTRY_TIMEOUT - 2 seconds
      await clock.tickAsync((REGISTRY_TIMEOUT - 2) * 1000)
      t.equal(fetchMock.getCalls().length, 1)

      // advance time to REGISTRY_TIMEOUT
      await clock.tickAsync(REGISTRY_TIMEOUT * 1000)
      t.equal(fetchMock.getCalls().length, 2)

      const requestInit = fetchMock.getCalls()[1].args[1]

      sinon.assert.match(requestInit.headers, { 'x-api-key': opts.apiKey })

      const parsedBody = JSON.parse(requestInit.body)

      sinon.assert.match(parsedBody, {
        query: reportQuery,
        variables: {
          executableSchema: opts.schema,
          info: sinon.match.object
        }
      })
    }
  )

  t.test(
    'runs the next iteration sooner than the MAX_TIMEOUT reported by the registry',
    async (t) => {
      const { fastify, opts } = t.context

      // 24 Hour timeout
      const REGISTRY_TIMEOUT = 86400

      const fetchMock = sinon.stub().resolves({
        ok: true,
        json: sinon.stub().resolves({
          data: {
            me: {
              reportServerInfo: {
                inSeconds: REGISTRY_TIMEOUT,
                withExecutableSchema: false
              }
            }
          }
        })
      })

      const plugin = proxyquire('../', { 'node-fetch': fetchMock })
      fastify.register(plugin, opts)

      await fastify.ready()

      // initial call to registry
      t.equal(fetchMock.getCalls().length, 1)

      // advance time to after RETRY_TIMEOUT
      await clock.tickAsync((RETRY_TIMEOUT + 10) * 1000)
      t.equal(fetchMock.getCalls().length, 2)

      const requestInit = fetchMock.getCalls()[1].args[1]
      const parsedBody = JSON.parse(requestInit.body)

      sinon.assert.match(parsedBody, {
        query: initialQuery,
        variables: {
          executableSchema: false,
          info: sinon.match.object
        }
      })
    }
  )

  t.test(
    'plugin retries after a failed registry request (non 200)',
    async (t) => {
      const { fastify, opts } = t.context

      const fetchMock = sinon.stub().resolves({ ok: false })
      const plugin = proxyquire('../', { 'node-fetch': fetchMock })
      fastify.register(plugin, opts)

      await fastify.ready()

      // Initial call made?
      t.equal(fetchMock.getCalls().length, 1)

      // advance time by RETRY_TIMEOUT - 2 seconds
      await clock.tickAsync((RETRY_TIMEOUT - 2) * 1000)
      t.equal(fetchMock.getCalls().length, 1)

      // advance time to after RETRY_TIMEOUT
      await clock.tickAsync(RETRY_TIMEOUT * 1000)
      t.equal(fetchMock.getCalls().length, 2)
    }
  )

  t.test('plugin retries after a malformed registry response', async (t) => {
    const { fastify, opts } = t.context

    const fetchMock = sinon.stub().resolves({
      ok: true,
      json: sinon.stub().resolves({ foo: 'bar' })
    })

    const plugin = proxyquire('../', { 'node-fetch': fetchMock })
    fastify.register(plugin, opts)

    await fastify.ready()

    // Initial call made?
    t.equal(fetchMock.getCalls().length, 1)

    // advance time by RETRY_TIMEOUT - 2 seconds
    await clock.tickAsync((RETRY_TIMEOUT - 2) * 1000)
    t.equal(fetchMock.getCalls().length, 1)

    // advance time to after RETRY_TIMEOUT
    await clock.tickAsync(RETRY_TIMEOUT * 1000)
    t.equal(fetchMock.getCalls().length, 2)
  })

  t.test('plugin retries after an unknown registry response', async (t) => {
    const { fastify, opts } = t.context
    const fetchMock = sinon.stub().resolves({
      ok: true,
      json: sinon.stub().resolves({
        data: {
          me: {
            foo: 'bar'
          }
        }
      })
    })

    const plugin = proxyquire('../', { 'node-fetch': fetchMock })
    fastify.register(plugin, opts)

    await fastify.ready()

    // Initial call made?
    t.equal(fetchMock.getCalls().length, 1)

    // advance time by RETRY_TIMEOUT - 2 seconds
    await clock.tickAsync((RETRY_TIMEOUT - 2) * 1000)
    t.equal(fetchMock.getCalls().length, 1)

    // advance time to after RETRY_TIMEOUT
    await clock.tickAsync(RETRY_TIMEOUT * 1000)
    t.equal(fetchMock.getCalls().length, 2)
  })

  t.test('plugin exits after a fatal exception', async (t) => {
    const { fastify, opts } = t.context
    const fetchMock = sinon.stub().throws()

    const plugin = proxyquire('../', { 'node-fetch': fetchMock })
    fastify.register(plugin, opts)

    await fastify.ready()
    t.equal(fetchMock.getCalls().length, 1)

    // Ensure plugin has exited on exception by checking
    // there are no further retries.
    await clock.tickAsync(RETRY_TIMEOUT * 2 * 1000)
    t.equal(fetchMock.getCalls().length, 1)
  })
})
