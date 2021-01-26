'use strict'

const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const fetch = require('node-fetch')
const { promisify } = require('util')
const { name, version} = require('./package.json')
const { report } = require('process')

const sleep = promisify(setTimeout)

const schema = `
  type Book {
    title: String
    author: String
    price: Float
  }

  type Query {
    books: [Book]
  }
`
const options = {
  schema,
  apolloKey: '',
  apolloGraphVariant: 'current',
  registryUrl: 'https://schema-reporting.api.apollographql.com/api/graphql'
}

function getExecutableSchemaId(schema) {
  return crypto.createHash('sha256').update(schema).digest('hex')
}

function normalizeSchema(schema) {
  // Apply stable sorting (such as alphabetical) to the order 
  // of all type, field, and argument definitions.

  // Remove all redundant whitespace.
  
  // Remove all comments (but not docstrings).
  
  return schema
}

async function makeRegistryRequest(url, key, info, executableSchema = false) {
  const query = `
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-api-key': key
    },
    body: JSON.stringify({
      query,
      variables: {
        executableSchema,
        info,
      }
    })
  })

  const { data: { me: { reportServerInfo } }} = await response.json()
  console.log(reportServerInfo)
  return reportServerInfo
}

async function main(opts) {
  let timeout;

  const normalizedSchema = normalizeSchema(opts.schema)

  const edgeServerInfo = {
    bootId: uuidv4(),
    // bootId: '8a461928-c808-4ada-b449-c38bb01e636a',
    executableSchemaId: getExecutableSchemaId(normalizedSchema),
    graphVariant: opts.apolloGraphVariant,
    // libraryVersion: `${name}-${version}`,
    // platform: 'localhost',
    // runtimeVersion: `node ${process.version}`,
    // serverId: 'persistent-identifier',
    // userVersion: ''
  }
  console.log(edgeServerInfo)

  async function updateRegistry(timeout = 0) {
    await sleep(timeout * 1000)
    const { inSeconds, executableSchema } = await makeRegistryRequest(opts.registryUrl, opts.apolloKey, edgeServerInfo)
    return inSeconds
  }

  const initialResp = await makeRegistryRequest(opts.registryUrl, opts.apolloKey, edgeServerInfo)
  timeout = initialResp.inSeconds

  while(true) {
    timeout = await updateRegistry(timeout)
    console.log(`Timeout is now ${timeout}`)
  }

}

main(options)