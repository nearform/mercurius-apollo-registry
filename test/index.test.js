'use strict'

const path = require('path')
const tap = require('tap')
const test = tap.test
const Fastify = require('fastify')
const fp = require('fastify-plugin')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const faker = require('faker')
const fetchMock = require('fetch-mock')

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
  t.plan(2)

  const registryUrl = faker.internet.url()
  fetchMock.get(registryUrl, mockSuccessfulRequest)
  const plugin = proxyquire('../', { 'node-fetch': fetchMock })

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
