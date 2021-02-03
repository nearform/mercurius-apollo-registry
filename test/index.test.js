'use strict'

const tap = require('tap')
const test = tap.test
const Fastify = require('fastify')
const fp = require('fastify-plugin')
const proxyquire = require('proxyquire')
const faker = require('faker')

/**
 * mock fetch manually
 * const json = sinon.stub()
  const fetchMockManual = sinon.stub().resolves({
    ok: true,
    json: json
  })

  json.resolves({})
 */

const mockSuccessfulRequest = {
  data: {
    me: {
      reportServerInfo: {
        inSeconds: 180,
        withExecutableSchema: false
      }
    }
  }
}

function makeStubMercurius() {
  return fp(async () => {}, {
    name: 'mercurius'
  })
}

test('plugin registration', async t => {
  t.test('plugin should exist and load without error', async t => {
    const fetchMock = require('fetch-mock').sandbox()
    fetchMock.any(mockSuccessfulRequest)
    const plugin = proxyquire('../', { 'node-fetch': fetchMock })

    const fastify = Fastify()

    /**
     * use t.teardDown to cleanup after the test
     */

    fastify.register(makeStubMercurius())

    fastify.register(plugin, {
      apiKey: faker.random.uuid(),
      schema: faker.lorem.paragraph(),
      registryUrl: faker.internet.url()
    })

    await fastify.ready()
    return fastify.close()
  })

  t.test('plugin should throw an error if schema is missing', async t => {
    const fetchMock = require('fetch-mock').sandbox()
    fetchMock.any(mockSuccessfulRequest)
    const plugin = proxyquire('../', { 'node-fetch': fetchMock })

    const fastify = Fastify()

    fastify.register(makeStubMercurius())

    fastify.register(plugin, {
      apiKey: faker.random.uuid(),
      registryUrl: faker.internet.url()
    })

    return t.rejects(() => fastify.ready(), 'a schema string is required')
  })

  t.test('plugin should throw an error if schema is missing', async t => {
    const fetchMock = require('fetch-mock').sandbox()
    fetchMock.any(mockSuccessfulRequest)
    const plugin = proxyquire('../', { 'node-fetch': fetchMock })

    const fastify = Fastify()

    fastify.register(makeStubMercurius())

    fastify.register(plugin, {
      apiKey: faker.random.uuid(),
      registryUrl: faker.internet.url(),
      schema: ''
    })

    return t.rejects(() => fastify.ready(), 'a schema string is required')
  })

  t.test('plugin should throw an error if api key is missing', async t => {
    // inline please
    const registryUrl = faker.internet.url()
    const fetchMock = require('fetch-mock').sandbox()
    fetchMock.any(mockSuccessfulRequest)
    const plugin = proxyquire('../', { 'node-fetch': fetchMock })

    const fastify = Fastify()

    fastify.register(makeStubMercurius())

    fastify.register(plugin, {
      schema: faker.lorem.paragraph(),
      registryUrl
    })

    return t.rejects(
      () => fastify.ready(),
      'an Apollo Studio API key is required'
    )
  })
})

// t.test('plugin should handle fetch errors', t => {})

// t.test('plugin should throw an error if the registry responds with a malformed response', t => {})
