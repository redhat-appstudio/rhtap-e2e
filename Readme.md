# Red Hat Trusted Application Pipeline Tests

> [!WARNING]  
> This tests are in very beta state yet. Before running them you need to perform some steps

* Install RHTAP from https://github.com/redhat-appstudio/rhtap-cli in CI mode. 
    * You need to change this [CI value](https://github.com/redhat-appstudio/rhtap-cli/blob/main/installer/charts/values.yaml.tpl#L13) to true.
* Update the environments needed in the [default.env](./default.env) file. After you create them just run: `source default.env`
* Run `yarn && yarn test`
