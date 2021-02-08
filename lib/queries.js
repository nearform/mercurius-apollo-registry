'use strict'

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

module.exports = {
  initialQuery,
  reportQuery
}
