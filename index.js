'use strict'

const crypto = require('crypto')
const util = require('util')
const fp = require('fastify-plugin')
const fetch = require('node-fetch')
const { v4: uuidv4 } = require('uuid')

const wait = util.promisify(setTimeout)

async function makeRegistryRequest ({ registryUrl, apiKey, edgeServerInfo, executableSchema, log }) {
  try {
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
    const jsonData = await response.json()
    log.debug(jsonData, 'Registry response')

    const { data: { me: { reportServerInfo } } } = jsonData
    return reportServerInfo
  } catch (error) {
    log.error(error)
    // We should handle timeout/400/500 errors here as
    // well as malformed responses and GraphQL errors

    // For now lets throw.
    throw error
  }
}

function normalizeSchema (schema) {
  return schema.replace(/(\r\n|\n|\r)/gm, '').replace(/\s+/g, ' ').trim()
}

function getExecutableSchemaId (schema) {
  return crypto.createHash('sha256').update(schema).digest('hex')
}

async function reporterLoop (log, options, edgeServerInfo) {
  let lastResponse

  do {
    const executableSchema = (lastResponse && lastResponse.withExecutableSchema) ? options.schema : false

    log.debug(`Making registry request with schema: ${!!executableSchema}`)

    lastResponse = await makeRegistryRequest({ ...options, edgeServerInfo, executableSchema, log })

    if (lastResponse) {
      if (lastResponse.inSeconds >= 3600) {
        log.warn('Registry timeout is greater than 3600 seconds. Possible registry or configuration issue. Trying again in 60 seconds.')
        lastResponse.inSeconds = 60
      }

      log.debug(`Waiting ${lastResponse.inSeconds} seconds until next registry request`)
      await wait(lastResponse.inSeconds * 1000)
    }
  } while (lastResponse)

  // TODO: handle this case better
  throw new Error('Apollo Registry Reporter Died')
}

const plugin = async function (fastify, opts) {
  if (!opts.apiKey) {
    throw new Error('an Apollo Studio API key is required')
  }

  if (!opts.schema) {
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

  fastify.log.debug(`Edge Server Config: ${JSON.stringify(edgeServerInfo)}`)

  fastify.addHook('onReady', async function () {
    reporterLoop(fastify.log, options, edgeServerInfo)
  })
}

module.exports = fp(plugin, {
  fastify: '3.x',
  name: 'mercuriusApolloRegistry',
  dependencies: ['mercurius']
})
