# RHTAP-CLI E2E Tests Triggering Guide for OCP CI <!-- omit from toc -->

- [Manually/Ad Hoc Triggering of Prow Jobs](#manuallyad-hoc-triggering-of-prow-jobs)
- [Native Cron Triggering Using OCP CI](#native-cron-triggering-using-ocp-ci)
- [Trigger Prow Using GitLab CI](#trigger-prow-using-gitlab-ci)


# Manually/Ad Hoc Triggering of Prow Jobs
I want to first start with this as it can be very helpful for us navigating network issues or flaky tests. We do have the abillity to re-trigger any prow job using a simple curl command with an API token. We do this using the [gangway-api](https://docs.google.com/document/d/1PAYVOqQ9z4GlOkXqkfWLZRRdGcAzqT8329Wm9QksFYY/edit). We have stored the gangway API Token in vault. All you need is that token and the name of the job that you want to trigger.


```
❯ curl -s -X POST -d '{"job_execution_type": "1"}' -H "Authorization: Bearer <GANGWAY_API_TOKEN>" https://gangway-ci.apps.ci.l2s4.p1.openshiftapps.com/v1/executions/<JOB_NAME>
```

A successful trigger will return something like this to your console.
```
{
 "id": "dbca7616-83c7-42dd-b74b-1b62447de3dd",
 "job_name": "periodic-ci-redhat-appstudio-rhtap-cli-main-rhtap-cli-install-nightly",
 "job_type": "PERIODIC",
 "job_status": "TRIGGERED",
 "pod_spec_options": {
  "envs": {},
  "labels": {},
  "annotations": {
   "executor": "gangway"
  }
 },
 "gcs_path": ""
}
```

The Gitops job is the only one that should be re-triggered differently. Since we use Gitlab-ci to trigger this job we already have everything necessary to trigger this wrapped up in a nice gitlab-ci job for us, so we can just re-trigger that.
- Go find the [most recently triggered pipeline here](https://gitlab.cee.redhat.com/rhtap-qe/rhtap-trigger/-/pipelines) click the link showing the pipeline run number and then click the circlular retry button next to the job name.
- This will do everything for you and trigger the prow job again.


# Native Cron Triggering Using OCP CI
3/4 of our jobs for the rhtap-cli rely on the cron trigger that is built into OCP CI ([OCP CI docs for periodic jobs](https://docs.ci.openshift.org/docs/architecture/ci-operator/#periodic-tests)).

Example of one of our jobs config using the cron value [is here](https://github.com/openshift/release/blob/master/ci-operator/config/redhat-appstudio/rhtap-cli/redhat-appstudio-rhtap-cli-main.yaml#L95).

# Trigger Prow Using GitLab CI
This is the only complicated trigger. Our job for GitOps relies on a query to the [internal datagrepper](https://datagrepper.engineering.redhat.com/). Internal meaning that we cannot run the necessary query from within a prow job since these prow jobs run on clusters outside of our VPN. So we needed a CI to run a query on the internal datagrepper to find the image for the RC (release candidate) image to be used for the new catalogsource that we'll be creating in the job.

Gitlab-ci worked perfectly for this and this is where our triggering will start for the gitops pre-release job.

- [Gitlab triggering repo](https://gitlab.cee.redhat.com/rhtap-qe/rhtap-trigger)
- [Gitops-prerelease script](https://gitlab.cee.redhat.com/rhtap-qe/rhtap-trigger/-/blob/main/gitops-prerelease-test-trigger.sh?ref_type=heads)
  - This script will find the latest RC for gitops or if an RC doesn't exist it will use the latest nightly.
  - It then mirrors that image to [quay.io](https://quay.io/repository/rhtap_qe/gitops-iib?tab=tags) so that within the prow job we can provide our quay credentials to be able to pull that image.
  - Then we trigger the prow job using the same method that we did above using the gangway-cli.
    - In order to pass the new GITOPS_IIB_IMAGE to the prow job we need to create a my_image_spec.txt file ([see here](https://gitlab.cee.redhat.com/rhtap-qe/rhtap-trigger/-/blob/main/gitops-prerelease-test-trigger.sh?ref_type=heads#L95))
    - Now when we run the trigger command using the gangway-cli this variable will be passed to the job and since our ref is built to make use of this variable it will be used to install the pre-release version of gitops.

