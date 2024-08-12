# RHTAP E2E Jobs Running in OpenShift CI<!-- omit from toc -->

- [Information for all Jobs](#information-for-all-jobs)
  - [Results](#results)
  - [Reporting](#reporting)
- [RHTAP-CLI Nightly Job](#rhtap-cli-nightly-job)
- [RHTAP-CLI Gitops Pre-release Job](#rhtap-cli-gitops-pre-release-job)
- [RHTAP-CLI RHDH Pre-release Job](#rhtap-cli-rhdh-pre-release-job)
- [RHTAP-CLI Pipelines Pre-release Job](#rhtap-cli-pipelines-pre-release-job)


# Information for all Jobs
All jobs deploy RHTAP using the rhtap-cli and are meant to run the rhtap-e2e test suite. The area that these jobs all differ from each other is that in each job a dependent product installed by the rhtap-cli will be a pre-release version instead of a GA version.

## Results
There are a few different areas of interest that we want to be aware of when looking at the results of this job:
1. Result of the rhtap-cli installation

    - Can be found at [artifacts/rhtap-cli-install-nightly/redhat-appstudio-rhtap-cli/build-log.txt](https://gcsweb-ci.apps.ci.l2s4.p1.openshiftapps.com/gcs/test-platform-results/logs/periodic-ci-redhat-appstudio-rhtap-cli-main-rhtap-cli-install-nightly/1821906207053451264/artifacts/rhtap-cli-install-nightly/redhat-appstudio-rhtap-cli/build-log.txt)
        - We should see **Deployment completed** near the bottom of the output and then a list of the installed operators in the rhtap namespace
2. Result of the rhtap-e2e test
    - Can be found at [artifacts/rhtap-cli-install-nightly/redhat-appstudio-rhtap-installer-e2e-test/build-log.txt](https://gcsweb-ci.apps.ci.l2s4.p1.openshiftapps.com/gcs/test-platform-results/logs/periodic-ci-redhat-appstudio-rhtap-cli-main-rhtap-cli-install-nightly/1821906207053451264/artifacts/rhtap-cli-install-nightly/redhat-appstudio-rhtap-installer-e2e-test/build-log.txt)
        - The output at the bottom should show **Test Suites: 12 passed, 12 total**
3. Installed_versions file
    - Can be found at [artifacts/rhtap-cli-install-nightly/redhat-appstudio-rhtap-cli/artifacts/installed_versions.txt](https://gcsweb-ci.apps.ci.l2s4.p1.openshiftapps.com/gcs/test-platform-results/logs/periodic-ci-redhat-appstudio-rhtap-cli-main-rhtap-cli-install-nightly/1821906207053451264/artifacts/rhtap-cli-install-nightly/redhat-appstudio-rhtap-cli/artifacts/installed_versions.txt)
        - This file shows the versions that were installed for the job that you are looking at.

## Reporting
All jobs will report pass/fail on the slack channel [#rhtap-qe-ci](https://redhat.enterprise.slack.com/archives/C06LFGDQ401)

# RHTAP-CLI Nightly Job
- This is the only job that installs all GA versions of dependent products. This uses the values from the file [rhtap-cli/charts/rhtap-subscriptions/values.yaml](https://github.com/redhat-appstudio/rhtap-cli/blob/main/charts/rhtap-subscriptions/values.yaml) exactly how it appears in the main branch of the rhtap-cli.

- This job runs nightly and is meant to make sure there is no regressions happening in the standard or default deployment.

**Name**
- [periodic-ci-redhat-appstudio-rhtap-cli-main-rhtap-cli-install-nightly](https://prow.ci.openshift.org/?job=periodic-ci-redhat-appstudio-rhtap-cli-main-rhtap-cli-install-nightly)

**Config**
- [redhat-appstudio-rhtap-cli-main.yaml#L48](https://github.com/openshift/release/blob/master/ci-operator/config/redhat-appstudio/rhtap-cli/redhat-appstudio-rhtap-cli-main.yaml#L48)

**Step-registry**
- [workflow/redhat-appstudio-rhtap-cli](https://steps.ci.openshift.org/workflow/redhat-appstudio-rhtap-cli)
- [reference/redhat-appstudio-rhtap-cli](https://steps.ci.openshift.org/reference/redhat-appstudio-rhtap-cli)


**Steps explained**

This won't cover every single line of code that is run but just the important bits to understand what is happening.
- First the job claims an OCP cluster from the cluster pool
- Then runs the [redhat-appstudio-openshift-trusted-ca](https://steps.ci.openshift.org/reference/redhat-appstudio-openshift-trusted-ca) ref
- Then runs the [redhat-appstudio-rhtap-cli](https://steps.ci.openshift.org/reference/redhat-appstudio-rhtap-cli) ref runs, this it where we install RHTAP
  - We set all necessary secrets that are mounted to the job from vault.
  - Then we need to make edits to the [charts/values.yaml.tpl](https://github.com/redhat-appstudio/rhtap-cli/blob/main/charts/values.yaml.tpl) and the [config.yaml](https://github.com/redhat-appstudio/rhtap-cli/blob/main/config.yaml) file.
    - We set ci to true and enter the github integration secrets in the values.yaml.tpl
    - We set then comment out acs and quay while changing the branch from release to main for the [tssc-sample-templates](https://github.com/redhat-appstudio/tssc-sample-templates/blob/main/all.yaml) repo.
- Skip the [configure_rhtap_for_prerelease_versions](https://steps.ci.openshift.org/reference/redhat-appstudio-rhtap-cli#line86) function as this is only meant for pre-release jobs, more on that below.
- Then the job runs the rhtap-cli integration commands for quay, acs, and gitlab.
- And finally runs the rhtap-cli-deploy command, we check for one of the final lines from the installer to make sure we stop if its not what we expect.
- Then it prints the installed versions for the operator found in the rhtap namespace, storing them as an artifact.
- Now that RHTAP is installed we run the [rhtap-e2e test ref](https://steps.ci.openshift.org/reference/redhat-appstudio-rhtap-installer-e2e-test) against the cluster and we report the job result to slack.

# RHTAP-CLI Gitops Pre-release Job
- This job is meant to test how the rhtap-cli and rhtap-e2e work while running a pre-release minor version of the Red Hat Gitops Operator. This edits the values for the [openshiftGitOps: section](https://github.com/redhat-appstudio/rhtap-cli/blob/main/charts/rhtap-subscriptions/values.yaml) in the file [rhtap-cli/charts/rhtap-subscriptions/values.yaml](https://github.com/redhat-appstudio/rhtap-cli/blob/main/charts/rhtap-subscriptions/values.yaml). We edit this to use a catalog source built from a pre-release bundle image that we set up prior to running the rhtap-cli.
- This job runs weekly (or ad-hoc, see more in the [triggering doc](../Triggering/OpenShift-CI-Triggering-Guide.md)). This is meant to catch any regressions that impact RHTAP early on in the development of the next minor release of gitops.

**Name**
- [periodic-ci-redhat-appstudio-rhtap-cli-main-rhtap-cli-gitops-prerelease](https://prow.ci.openshift.org/?job=periodic-ci-redhat-appstudio-rhtap-cli-main-rhtap-cli-gitops-prerelease)

**Config**
- [redhat-appstudio-rhtap-cli-main.yaml#L65](https://github.com/openshift/release/blob/master/ci-operator/config/redhat-appstudio/rhtap-cli/redhat-appstudio-rhtap-cli-main.yaml#L65)

**Steps in the step-registry**
- [workflow/redhat-appstudio-rhtap-cli-gitops-prerelease](https://steps.ci.openshift.org/workflow/redhat-appstudio-rhtap-cli-gitops-prerelease)
- [reference/redhat-appstudio-rhtap-cli-gitops-prerelease-install](https://steps.ci.openshift.org/reference/redhat-appstudio-rhtap-cli-gitops-prerelease-install)

**Steps explained**

This won't cover every single line of code that is run but just the important bits to understand what is happening.

The GitOps pre-release testing job is unique and bit more complex. Due to not being able to use datagrepper.engineering.redhat.com outside of VPN we needed to find a way to use this in a way that could trigger an OCP CI job (The Gitops QE team gave us a curl command to query their RC images that we should use for pre-release testing).
- The repo [rhtap-trigger](https://gitlab.cee.redhat.com/rhtap-qe/rhtap-trigger) was created and is used as a way for us to find, mirror the pre-release catalogsource image, and trigger the prow job using that image (more on this in the [triggering doc](../Triggering/OpenShift-CI-Triggering-Guide.md).

Now that the job is triggered with access to the pre-release catalogsource image and the prow job has started we do the following.
- Update the clusters pull-secret to include our quay credentials for the [image mirror location](https://quay.io/repository/rhtap_qe/gitops-iib?tab=tags).
- Then set up the necessary ICSP (ImageContentSourcePolicy) given to us by gitops QE
- The apply the catalog source using the image variable that we recieve from the trigger job ($GITOPS_IIB_IMAGE)
- Then we wait for the necessary pods to be ready to prove that this catalogsource is available and ready.
- Now the [configure_rhtap_for_prerelease_versions](https://steps.ci.openshift.org/reference/redhat-appstudio-rhtap-cli#line86) will read our jobs configuration to determine which values in the [charts/values.yaml.tpl](https://github.com/redhat-appstudio/rhtap-cli/blob/main/charts/values.yaml.tpl) to edit.
  - We swap the gitops info to use the new catalogsource and channel as our source and channel.
- Then as we always do we print and artifact the installed versions and run the e2e tests.

# RHTAP-CLI RHDH Pre-release Job
- This job is meant to test how the rhtap-cli and rhtap-e2e work while running a pre-release minor version of the Red Hat Developer Hub Operator. This edits the values for the [redHatDeveloperHub: section](https://github.com/redhat-appstudio/rhtap-cli/blob/main/charts/rhtap-subscriptions/values.yaml#L93C3-L93C22) in the file [rhtap-cli/charts/rhtap-subscriptions/values.yaml](https://github.com/redhat-appstudio/rhtap-cli/blob/main/charts/rhtap-subscriptions/values.yaml). We edit this to use a catalog source built from a pre-release bundle image that we set up prior to running the rhtap-cli.
- This job runs weekly (or ad-hoc, see more in the [triggering doc](../Triggering/OpenShift-CI-Triggering-Guide.md)). This is meant to catch any regressions that impact RHTAP early on in the development of the next minor release of developerhub.

**Name**
- https://prow.ci.openshift.org/?job=periodic-ci-redhat-appstudio-rhtap-cli-main-rhtap-cli-rhdh-prerelease
**Config**
- [redhat-appstudio-rhtap-cli-main.yaml#L105](https://github.com/openshift/release/blob/master/ci-operator/config/redhat-appstudio/rhtap-cli/redhat-appstudio-rhtap-cli-main.yaml#L105)
**Steps in the step-registry**
- [workflow/redhat-appstudio-rhtap-cli-rhdh-prerelease](https://steps.ci.openshift.org/workflow/redhat-appstudio-rhtap-cli-rhdh-prerelease)
- [reference/redhat-appstudio-rhtap-cli-rhdh-prerelease-install](https://steps.ci.openshift.org/reference/redhat-appstudio-rhtap-cli-rhdh-prerelease-install)

**Steps explained**

This won't cover every single line of code that is run but just the important bits to understand what is happening.
- Nothing fancy with triggering this job runs on a cron once a week.
- Before we install rhtap using rhtap-cli we create a catalogsource from a pre-release rhdh image
  - We use a script given to us by the rhdh team that can install the pre-release product for us.
  - The only problem is that is applies to subscription and we want the rhtap-cli to do that for us so we comment out the part of the script that installs the subscription.
  - Then we run the install script to put the catalogsource in place.
- Now the [configure_rhtap_for_prerelease_versions](https://steps.ci.openshift.org/reference/redhat-appstudio-rhtap-cli#line86) will read our jobs configuration to determine which values in the [charts/values.yaml.tpl](https://github.com/redhat-appstudio/rhtap-cli/blob/main/charts/values.yaml.tpl) to edit.
  - We swap the redhatdeveloperhub info to use the new catalogsource and channel as our source and channel.  
- Then as we always do we print and artifact the installed versions and run the e2e tests.

# RHTAP-CLI Pipelines Pre-release Job
- This job is meant to test how the rhtap-cli and rhtap-e2e work while running a pre-release minor version of the Red Hat OpenShift Pipelines Operator. This edits the values for the [openshiftPipelines: section](https://github.com/redhat-appstudio/rhtap-cli/blob/main/charts/rhtap-subscriptions/values.yaml#L55C3-L55C22) in the file [rhtap-cli/charts/rhtap-subscriptions/values.yaml](https://github.com/redhat-appstudio/rhtap-cli/blob/main/charts/rhtap-subscriptions/values.yaml). We edit this to use a catalog source built from a pre-release bundle image that we set up prior to running the rhtap-cli.
- This job runs weekly (or ad-hoc, see more in the [triggering doc](../Triggering/OpenShift-CI-Triggering-Guide.md)). This is meant to catch any regressions that impact RHTAP early on in the development of the next minor release of pipelines.

**Name**
- [periodic-ci-redhat-appstudio-rhtap-cli-main-rhtap-cli-pipelines-prerelease](https://prow.ci.openshift.org/?job=periodic-ci-redhat-appstudio-rhtap-cli-main-rhtap-cli-pipelines-prerelease)
**Config**
- [redhat-appstudio-rhtap-cli-main.yaml#L85](https://github.com/openshift/release/blob/master/ci-operator/config/redhat-appstudio/rhtap-cli/redhat-appstudio-rhtap-cli-main.yaml#L85)
**Steps in the step-registry**
- [workflow/redhat-appstudio-rhtap-cli-pipelines-prerelease](https://steps.ci.openshift.org/workflow/redhat-appstudio-rhtap-cli-pipelines-prerelease)
- [reference/redhat-appstudio-rhtap-cli-pipelines-prerelease-install](https://steps.ci.openshift.org/reference/redhat-appstudio-rhtap-cli-pipelines-prerelease-install)

**Steps explained**

This won't cover every single line of code that is run but just the important bits to understand what is happening.
- Nothing fancy with triggering this job runs on a cron once a week.
- We were given images easily accessible to us that we pass as variables to this job, using these images we simply just create a pre-release catalogsource to be used by rhtap-cli.
- Now the [configure_rhtap_for_prerelease_versions](https://steps.ci.openshift.org/reference/redhat-appstudio-rhtap-cli#line86) will read our jobs configuration to determine which values in the [charts/values.yaml.tpl](https://github.com/redhat-appstudio/rhtap-cli/blob/main/charts/values.yaml.tpl) to edit.
  - We swap the redhatopenshiftpipelines info to use the new catalogsource and channel as our source and channel.  
- Then as we always do we print and artifact the installed versions and run the e2e tests.


