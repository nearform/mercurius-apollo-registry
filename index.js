'use strict'

const fp = require('fastify-plugin')
const fetch = require('node-fetch')
const { v4: uuidv4 } = require('uuid')

const { getExecutableSchemaId, normalizeSchema } = require('./lib/util')
const { initialQuery, reportQuery } = require('./lib/queries')

const MAX_TIMEOUT_SEC = 3600
const RETRY_TIMEOUT_SEC = 20
const RETRY_RESPONSE = {
  inSeconds: RETRY_TIMEOUT_SEC,
  withExecutableSchema: false
}

const defaultRegistryUrl =
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
    return RETRY_RESPONSE
  }

  const jsonData = await response.json()
  log.debug(jsonData, 'registry response')

  if (!jsonData || !jsonData.data || !jsonData.data.me) {
    log.warn('malformed registry response')

    // Retry request after timeout.
    return RETRY_RESPONSE
  }

  const {
    data: { me: report }
  } = jsonData

  if (report.reportServerInfo) {
    return report.reportServerInfo
  }

  // Protocol response doesn't match expected parameters
  // Retry request after timeout.
  log.warn(report, 'unknown registry response')
  return RETRY_RESPONSE
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
        `making registry request with executableSchema: ${!!executableSchema}`
      )

      lastResponse = await makeRegistryRequest({
        ...options,
        edgeServerInfo,
        executableSchema,
        log: fastify.log
      })

      if (lastResponse.inSeconds >= MAX_TIMEOUT_SEC) {
        fastify.log.warn(
          `registry timeout is greater than ${MAX_TIMEOUT_SEC} seconds. Possible registry or configuration issue. Trying again in ${RETRY_TIMEOUT_SEC} seconds.`
        )
        lastResponse = RETRY_RESPONSE
      }

      fastify.log.debug(
        `waiting ${lastResponse.inSeconds} seconds until next registry request`
      )

      await new Promise((resolve) => {
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
    registryUrl: opts.registryUrl || defaultRegistryUrl,
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
