'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusApolloRegistry = require('../')

const app = Fastify()

const books = [
  {
    title: 'The Time Machine',
    author: 'HG Wells',
    price: 10.00
  },
  {
    title: 'A Brief History of Time',
    author: 'Stephen Hawking',
    price: 12.00
  }
];


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

const resolvers = {
  Query: {
    books: () => books
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  graphiql: true
})

app.register(mercuriusApolloRegistry, {
  schema,
  apiKey: ''
})

app.get('/', async function (req, reply) {
  const query = '{ books { title author price } }'
  return reply.graphql(query)
})

app.listen(3000)
