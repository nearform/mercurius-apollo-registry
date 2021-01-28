const crypto = require('crypto')
const fp = require('fastify-plugin')
const fetch = require('node-fetch')
const { v4: uuidv4 } = require('uuid')

async function makeRegistryRequest({ registryUrl, apiKey, edgeServerInfo, executableSchema }) {
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
        'Accept': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query: executableSchema ? reportQuery : initialQuery,
        variables: {
          executableSchema,
          info: edgeServerInfo,
        }
      })
    })

    console.log(response)

    const jsonData = await response.json()

    console.log(JSON.stringify(jsonData))

    const { data: { me: { reportServerInfo } }} = jsonData
    return reportServerInfo
  } catch(error) {
    // We should handle timeout/400/500 errors here as 
    // well as malformed responses and GraphQL errors

    // For now lets throw.
    throw error
  }
} 

function normalizeSchema(schema) {
  // Apply stable sorting (such as alphabetical) to the order 
  // of all type, field, and argument definitions.

  // Remove all redundant whitespace.

  // Remove all comments (but not docstrings).

  // For now we just use the schema as is. 
  return schema
}

function getExecutableSchemaId(schema) {
  return crypto.createHash('sha256').update(schema).digest('hex')
}
// TODO: promisify
async function wait(sec = 20) {
  return new Promise(resolve => {
    setTimeout(resolve, sec * 1000);
  });
}

async function reporterLoop(options, edgeServerInfo) {
  let lastResponse

  do {
    const executableSchema = (lastResponse && lastResponse.withExecutableSchema) ? options.schema : false

    console.log('schema and last resp: ', JSON.stringify({ executableSchema, lastResponse }))

    lastResponse = await makeRegistryRequest({ ...options, edgeServerInfo, executableSchema })

    if(lastResponse) {
      console.log('Waiting ', lastResponse.inSeconds)
      await wait(lastResponse.inSeconds)
    }
  } while(lastResponse)

  // TODO: handle this case better
  throw new Error('Reporter Died')
}

const plugin = async function (fastify, opts) {
  if(!opts.apiKey) {
    throw new Error('an Apollo Studio API key is required')
  }

  if(!opts.schema) {
    throw new Error('a schema string is required')
  }

  const options = {
    graphVariant: opts.graphVariant || 'current',
    registryUrl:  opts.registryUrl || 'https://schema-reporting.api.apollographql.com/api/graphql',
    schema: opts.schema,
    apiKey: opts.apiKey
  }

  const edgeServerInfo = {
    bootId: uuidv4(),
    executableSchemaId: getExecutableSchemaId(normalizeSchema(options.schema)),
    graphVariant: options.graphVariant,
  }

  console.log(`Edge Server Config: ${JSON.stringify(edgeServerInfo)}`)
  reporterLoop(options, edgeServerInfo)

  return
}

module.exports = fp(plugin, {
  fastify: '3.x',
  name: 'mercurius-apollo-registry'
})
