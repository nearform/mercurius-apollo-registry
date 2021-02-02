'use strict'

const crypto = require('crypto')
const fp = require('fastify-plugin')
const fetch = require('node-fetch')
const { v4: uuidv4 } = require('uuid')

async function makeRegistryRequest ({ registryUrl, apiKey, edgeServerInfo, executableSchema, log }) {
  const initialQuery = `
  mutation ReportServerInfo($info: EdgeServerInfo!) {
    me {
      __typename
      ... on ServiceMutation {
        reportServerInfo(info: $info) {
          inSeconds
          withExecutableSchema
        }
      }
    }
  }
  `

  const reportQuery = `
  mutation ReportServerInfo($info: EdgeServerInfo!, $executableSchema: String) {
    me {
      __typename
      ... on ServiceMutation {
        reportServerInfo(info: $info, executableSchema: $executableSchema) {
          inSeconds
          withExecutableSchema
        }
      }
    }
  }`

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

  if (response.ok) {
    const jsonData = await response.json()
    log.debug(jsonData, 'registry response')

    if (!jsonData || !jsonData.data || !jsonData.data.me) {
      log.warn('malformed registry response')
      throw new Error('malformed registry response')
    }

    const { data: { me: report } } = jsonData

    if (report.reportServerInfo) {
      return report.reportServerInfo
    } else {
      // if the protocol response doesn't match
      // expected parameters we stop reporting.
      log.debug(report, 'unknown registry error occurred')
      throw new Error('unknown registry error occurred')
    }
  } else {
    log.warn(`registry request failed with HTTP error response: ${response.status} ${response.statusText}`)
    // Protocol requires us to try again in 20 seconds for non-2xx response.
    return { inSeconds: 20, withExecutableSchema: false }
  }
}

function normalizeSchema (schema) {
  return schema.replace(/(\r\n|\n|\r)/gm, '').replace(/\s+/g, ' ').trim()
}

function getExecutableSchemaId (schema) {
  return crypto.createHash('sha256').update(schema).digest('hex')
}

async function reporterLoop (fastify, options, edgeServerInfo) {
  let lastResponse
  let timeoutHandle

  fastify.addHook('onClose', (fastify, done) => {
    clearTimeout(timeoutHandle)
    timeoutHandle = false
    done()
  })

  do {
    try {
      const executableSchema = (lastResponse && lastResponse.withExecutableSchema) ? options.schema : false

      fastify.log.debug(`making registry request with schema: ${!!executableSchema}`)

      lastResponse = await makeRegistryRequest({ ...options, edgeServerInfo, executableSchema, log: fastify.log })

      if (lastResponse) {
        if (lastResponse.inSeconds >= 3600) {
          fastify.log.warn('registry timeout is greater than 3600 seconds. Possible registry or configuration issue. Trying again in 60 seconds.')
          lastResponse.inSeconds = 60
        }

        fastify.log.debug(`waiting ${lastResponse.inSeconds} seconds until next registry request`)

        await new Promise((resolve, reject) => {
          timeoutHandle = setTimeout(() => resolve(), lastResponse.inSeconds * 1000)
        })
      }
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

  if (!opts.schema || !opts.schema.length) {
    throw new Error('a schema string is required')
  }

  const options = {
    graphVariant: opts.graphVariant || 'current',
    registryUrl: opts.registryUrl || 'https://schema-reporting.api.apollographql.com/api/graphql',
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
