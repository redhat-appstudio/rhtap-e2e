# Red Hat Trusted Application Pipeline Tests

> [!WARNING]  
> This tests are in very beta state yet. Before running them you need to perform some steps

## Setup
* Install RHTAP from https://github.com/redhat-appstudio/rhtap-cli in CI mode
    * You need to change this [CI value](https://github.com/redhat-appstudio/rhtap-cli/blob/main/installer/charts/values.yaml.tpl#L13) to true.
* Update the environments needed in the [default.env](./default.env) file. After you create them just run: `source default.env`
* Run installation with `yarn`

## Running tests
To run **all tests** based on [jest confiuration](https://github.com/redhat-appstudio/rhtap-e2e/blob/main/jest.config.js) use:
`yarn test` 

To run a **single test** use: `yarn test <test file>`

To run a specific **group** of tests use: `yarn test --group=<test group>`
(if you wish to exclude a group use: `--group=-<test file>`)
