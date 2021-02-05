const crypto = require('crypto')

function normalizeSchema(schema) {
  return schema
    .replace(/(\r\n|\n|\r)/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getExecutableSchemaId(schema) {
  return crypto.createHash('sha256').update(schema).digest('hex')
}

module.exports = {
  getExecutableSchemaId,
  normalizeSchema
}
