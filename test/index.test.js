'use strict'

const path = require('path')
const tap = require('tap')
const test = tap.test
const Fastify = require('fastify')
const fp = require('fastify-plugin')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const faker = require('faker')

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

function makeStubMercurius () {
  return fp(
    async () => {},
    {
      name: 'mercurius'
    }
  )
}

test('plugin should exist and load without error', t => {
  t.plan(1)

  const registryUrl = faker.internet.url()
  const fetchMock = require('fetch-mock').sandbox()
  fetchMock.any(mockSuccessfulRequest)
  const plugin = proxyquire('../', { 'node-fetch': fetchMock });

  const fastify = Fastify()

  fastify.register(makeStubMercurius())

  fastify.register(plugin, {
    apiKey: faker.random.uuid(),
    schema: faker.lorem.paragraph(),
    registryUrl
  })

  fastify.ready(err => {
    t.error(err)

    fastify.close()
    fetchMock.reset()
  })
})

test('plugin should throw an error if api key is missing', t => {
  t.plan(2)

  const registryUrl = faker.internet.url()
  const fetchMock = require('fetch-mock').sandbox()
  fetchMock.any(mockSuccessfulRequest)
  const plugin = proxyquire('../', { 'node-fetch': fetchMock });

  const fastify = Fastify()

  fastify.register(makeStubMercurius())

  fastify.register(plugin, {
    apiKey: faker.random.uuid(),
    schema: undefined,
    registryUrl
  })

  fastify.ready(err => {
    t.ok(err)
    t.ok(err.message, 'an Apollo Studio API key is required')
    fastify.close()
    fetchMock.reset()
  })
})

test('plugin should throw an error if schema is missing', t => {
  t.plan(2)

  const registryUrl = faker.internet.url()
  const fetchMock = require('fetch-mock').sandbox()
  fetchMock.any(mockSuccessfulRequest)
  const plugin = proxyquire('../', { 'node-fetch': fetchMock });

  const fastify = Fastify()

  fastify.register(makeStubMercurius())

  fastify.register(plugin, {
    apiKey: undefined,
    schema: faker.lorem.paragraph(),
    registryUrl
  })

  fastify.ready(err => {
    t.ok(err)
    t.ok(err.message, 'a schema string is required')
    fastify.close()
    fetchMock.reset()
  })
})

test('plugin should throw an error if schema is an empty string', t => {
  t.plan(2)

  const registryUrl = faker.internet.url()
  const fetchMock = require('fetch-mock').sandbox()
  fetchMock.any(mockSuccessfulRequest)
  const plugin = proxyquire('../', { 'node-fetch': fetchMock });

  const fastify = Fastify()

  fastify.register(makeStubMercurius())

  fastify.register(plugin, {
    apiKey: undefined,
    schema: '',
    registryUrl
  })

  fastify.ready(err => {
    t.ok(err)
    t.ok(err.message, 'a schema string is required')
    fastify.close()
    fetchMock.reset()
  })
})

// test('plugin should handle fetch errors', t => {})

// test('plugin should throw an error if the registry responds with a malformed response', t => {})
