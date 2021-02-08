# Mercurius Apollo Registry Plugin

A Mercurius plugin for schema reporting to Apollo Studio.

## Installation

```
npm install mercurius-apollo-registry
```

Please note that this plugin requires Mercurius as a dependency.

## Usage

This plugin can be used to report a given GraphQL schema to the Apollo Studio Registry.

### Set up Apollo Studio

In order to use this plugin, you should already have an account with Apollo Studio as well as at least one target graph already defined. Each graph has a unique API key associated with it that will be required by this plugin at start up.

You can find more information about Apollo Studio [here](https://www.apollographql.com/docs/studio/getting-started/).

### Add plugin to your fastify instance

```js
const mercuriusApolloRegistry = require('mercurius-apollo-registry')

fastify.register(mercuriusApolloRegistry, {
  schema,
  apiKey
})

```

### Plugin options

- `schema` `string` (required) A stringified version of the GraphQL schema used by Mercurius.
- `apiKey` `string` (required) API key for the specific graph you wish to reference in Apollo Studio.
- `graphVariant` `string` (optional) The GraphQL variant to use in Apollo Studio. Defaults to `current`.
- `registryUrl` `string` (optional) The registry API endpoint to use. Defaults to `https://schema-reporting.api.apollographql.com/api/graphql`.

## Registry Protocol

A complete reference for the registry reporting protocol can be found in the [Apollo GraphQL Documentation](https://www.apollographql.com/docs/studio/schema/schema-reporting-protocol/).

This plugin aims to allow integration and operability between Apollo Studio and Mercurius.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md)

## License

Copyright NearForm Ltd 2021. Licensed under the [Apache-2.0 license](http://www.apache.org/licenses/LICENSE-2.0).
