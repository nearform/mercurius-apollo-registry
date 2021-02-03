'use strict'

const crypto = require('crypto')
const fp = require('fastify-plugin')
const fetch = require('node-fetch')
const { v4: uuidv4 } = require('uuid')

const { initialQuery, reportQuery } = require('./lib/queries')

const defaultRegistryURl =
  'https://schema-reporting.api.apollographql.com/api/graphql'
const defaultGraphVariant = 'current'

async function makeRegistryRequest({
  registryUrl,
  apiKey,
  edgeServerInfo,
  executableSchema,
  log
}) {
  const response = await fetch(registryUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      query: executableSchema ? reportQuery : initialQuery,
      variables: {
        executableSchema,
        info: edgeServerInfo
      }
    })
  })

  if (!response.ok) {
    log.warn(
      `registry request failed with HTTP error response: ${response.status} ${response.statusText}`
    )
    // Protocol requires us to try again in 20 seconds for non-2xx response.
    return { inSeconds: 20, withExecutableSchema: false }
  }

  const jsonData = await response.json()
  log.debug(jsonData, 'registry response')

  if (!jsonData || !jsonData.data || !jsonData.data.me) {
    log.warn('malformed registry response')
    throw new Error('malformed registry response')
  }

  const {
    data: { me: report }
  } = jsonData

  if (report.reportServerInfo) {
    return report.reportServerInfo
  }

  // if the protocol response doesn't match
  // expected parameters we stop reporting.
  log.warn(report, 'unknown registry error occurred')
  throw new Error('unknown registry error occurred')
}

function normalizeSchema(schema) {
  return schema
    .replace(/(\r\n|\n|\r)/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getExecutableSchemaId(schema) {
  return crypto.createHash('sha256').update(schema).digest('hex')
}

async function reporterLoop(fastify, options, edgeServerInfo) {
  let lastResponse
  let timeoutHandle
  let resolveTimeoutPromise

  fastify.addHook('onClose', (_, done) => {
    clearTimeout(timeoutHandle)
    timeoutHandle = null

    if (resolveTimeoutPromise) {
      resolveTimeoutPromise()
    }

    done()
  })

  do {
    try {
      const executableSchema =
        lastResponse && lastResponse.withExecutableSchema
          ? options.schema
          : false

      fastify.log.debug(
        `making registry request with schema: ${!!executableSchema}`
      )

      lastResponse = await makeRegistryRequest({
        ...options,
        edgeServerInfo,
        executableSchema,
        log: fastify.log
      })

      if (lastResponse.inSeconds >= 3600) {
        fastify.log.warn(
          'registry timeout is greater than 3600 seconds. Possible registry or configuration issue. Trying again in 60 seconds.'
        )
        lastResponse.inSeconds = 60
      }

      fastify.log.debug(
        `waiting ${lastResponse.inSeconds} seconds until next registry request`
      )

      await new Promise(resolve => {
        resolveTimeoutPromise = resolve
        timeoutHandle = setTimeout(resolve, lastResponse.inSeconds * 1000)
      })
    } catch (error) {
      fastify.log.error(error, 'fatal error occurred during registry update')
      throw error
    }
  } while (timeoutHandle && lastResponse)

  fastify.log.info('registry reporter has stopped')
}

const plugin = async function (fastify, opts) {
  if (!opts.apiKey) {
    throw new Error('an Apollo Studio API key is required')
  }

  if (typeof opts.schema !== 'string' || !opts.schema.length) {
    throw new Error('a schema string is required')
  }

  const options = {
    graphVariant: opts.graphVariant || defaultGraphVariant,
    registryUrl: opts.registryUrl || defaultRegistryURl,
    schema: normalizeSchema(opts.schema),
    apiKey: opts.apiKey
  }

  const edgeServerInfo = {
    bootId: uuidv4(),
    executableSchemaId: getExecutableSchemaId(options.schema),
    graphVariant: options.graphVariant
  }

  fastify.log.debug(edgeServerInfo, 'generated edge server config')

  fastify.addHook('onReady', async function () {
    reporterLoop(fastify, options, edgeServerInfo)
  })
}

module.exports = fp(plugin, {
  fastify: '3.x',
  name: 'mercuriusApolloRegistry',
  dependencies: ['mercurius']
})
