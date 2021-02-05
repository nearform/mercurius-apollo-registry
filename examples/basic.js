const Fastify = require('fastify')
const mercurius = require('mercurius')

const mercuriusApolloRegistry = require('../')

const app = Fastify()

const books = [
  {
    title: 'The Time Machine',
    author: 'HG Wells',
    price: 10.0
  },
  {
    title: 'A Brief History of Time',
    author: 'Stephen Hawking',
    price: 12.0
  }
]

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
  apiKey: 'update-with-your-graphs-api-key'
})

app.listen(3000)
