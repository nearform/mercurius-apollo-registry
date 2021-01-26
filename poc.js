'use strict'

const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const fetch = require('node-fetch')
const { name, version} = require('./package.json')
const { report } = require('process')

const schema = `
  type Book {
    title: String
    author: String
    price: Float
    inStock: Boolean
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

async function makeInitialRegistryRequest(url, key, info) {
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
        executableSchema: false,
        info,
      }
    })
  })

  const { data: { me: { reportServerInfo } }} = await response.json()
  console.log(reportServerInfo)
  return reportServerInfo
}

async function makeSchemaRegistryRequest(url, key, info, executableSchema) {
  const query = `
    mutation ReportServerInfo($info: EdgeServerInfo!, $executableSchema: String ) {
      me {
        __typename
        ... on ServiceMutation {
          reportServerInfo(info: $info, executableSchema: $executableSchema) {
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
      'x-api-key': key,
      'apollographql-client-name': 'apollo-engine-reporting',
      'apollographql-client-version': '0.1.0'
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
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}   

async function main(opts) {
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
  const { inSeconds, withExecutableSchema } = await makeInitialRegistryRequest(opts.registryUrl, opts.apolloKey, edgeServerInfo)

  if(withExecutableSchema) {
    console.log(`Waiting ${inSeconds} until uploading to registry...`)
    await sleep(inSeconds * 1000)
    await makeSchemaRegistryRequest(opts.registryUrl, opts.apolloKey, edgeServerInfo, normalizedSchema)
  } else {
    // we need to retry in $inSeconds time.
    console.log(`retry needed in ${inSeconds}`)
  }
}

main(options)