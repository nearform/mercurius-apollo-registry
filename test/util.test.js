'use strict'

const tap = require('tap')
const test = tap.test

const { getExecutableSchemaId, normalizeSchema } = require('../lib/util')

test('getExecutableSchemaId tests', async (t) => {
  t.test(
    'the correct schema hash is computed for a given string',
    async (t) => {
      const schema = 'this is a schema'
      const expectedSHA =
        '58240a12c29ea996000f31517c5c76a371b8a76b0ad1967180cf3b7c1cb311b4'

      t.equal(getExecutableSchemaId(schema), expectedSHA)
    }
  )
})

test('normalizeSchema tests', async (t) => {
  t.test(
    'a normalized schema is returned for a given schema string',
    async (t) => {
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
      const normalizedString =
        'type Book { title: String author: String price: Float } type Query { books: [Book] }'
      t.equal(normalizeSchema(schema), normalizedString)
    }
  )

  t.test('normalizeSchema removes additional white space', async (t) => {
    const schema = 'this  has  extra  whitespace'
    const normalizedString = 'this has extra whitespace'
    t.equal(normalizeSchema(schema), normalizedString)
  })

  t.test('normalizeSchema removes new line characters', async (t) => {
    const schema = `
    this
    has
    extra
    newlines
    `
    const normalizedString = 'this has extra newlines'
    t.equal(normalizeSchema(schema), normalizedString)
  })
})
