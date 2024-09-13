# Red Hat Trsuted Application Pipeline Tests

Adding something to commit..

> [!WARNING]  
> This tests are in very beta state yet. Before running them you need to perform some steps

* Install Rhtap from https://github.com/redhat-appstudio/rhtap-installer in CI mode. 
    * You need to update private-values.yaml by running before installing rhtap `yq e -i '.debug.ci=true' private-values.yaml`
* Create the environments needed in the [default.env](./default.env) file. After you create them just run: `source default.env`
* Run `yarn && yarn test`
