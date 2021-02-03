'use strict'

const tap = require('tap')
const test = tap.test
const Fastify = require('fastify')
const fp = require('fastify-plugin')
const proxyquire = require('proxyquire')
const faker = require('faker')
const sinon = require('sinon')

const { initialQuery } = require('../lib/queries')

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

test('apollo regitry api interaction', async t => {
  t.only(
    'invokes the api with executableSchema false and the initial query',
    async t => {
      const fetchMock = sinon.stub().resolves({
        ok: true,
        json: sinon
          .stub()
          .resolves({ data: { me: { reportServerInfo: true } } })
      })

      const plugin = proxyquire('../', { 'node-fetch': fetchMock })

      const fastify = Fastify()

      fastify.register(makeStubMercurius())

      const registryUrl = faker.internet.url()
      const apiKey = faker.random.uuid()
      fastify.register(plugin, {
        apiKey,
        schema: faker.lorem.paragraph(),
        registryUrl
      })

      await fastify.ready()

      const requestInit = fetchMock.getCalls()[0].args[1]

      sinon.assert.match(requestInit.headers, { 'x-api-key': apiKey })

      const parsedBody = JSON.parse(requestInit.body)

      sinon.assert.match(parsedBody, {
        query: initialQuery,
        variables: {
          executableSchema: false,
          info: sinon.match.object
        }
      })

      return fastify.close()
    }
  )

  t.only(
    'pseudocode: runs the next iteration only when the inSeconds from the reponse have elapsed',
    async t => {
      const inSeconds = 42

      const fetchMock = sinon.stub().resolves({
        ok: true,
        json: sinon
          .stub()
          .resolves({ data: { me: { reportServerInfo: true, inSeconds } } })
      })

      const plugin = proxyquire('../', { 'node-fetch': fetchMock })

      const fastify = Fastify()

      fastify.register(makeStubMercurius())

      const registryUrl = faker.internet.url()
      const apiKey = faker.random.uuid()
      fastify.register(plugin, {
        apiKey,
        schema: faker.lorem.paragraph(),
        registryUrl
      })

      await fastify.ready()

      t.equal(fetchMock.getCalls().length, 1)

      // advance time by inSeconds - X
      t.equal(fetchMock.getCalls().length, 1)

      // advance time to inSeconds + x
      t.equal(fetchMock.getCalls().length, 2)
      // ^ expect that it's invoke with the right parameters that you expect in the second call

      return fastify.close()
    }
  )
})
