# Scripts to configure three namespaces for dev,stage,prod
# the namespaces can exist in advance or you can run the templates and 
# the namespaces will be created by app of apps
# you can reuse a namespace trio across multiple templates
# or every time. 

export APPLICATION_ROOT_NAMESPACE \
  APPLICATION_DEVELOPMENT_NAMESPACE \
  APPLICATION_STAGING_NAMESPACE \
  APPLICATION_PRODUCTION_NAMESPACE \
  ALL_ENVIRONMENTS_NAMESPACES

export APPLICATION_ROOT_NAMESPACE="${1:-rhtap-e2e}"
export APPLICATION_DEVELOPMENT_NAMESPACE="$APPLICATION_ROOT_NAMESPACE-development"
export APPLICATION_STAGING_NAMESPACE="$APPLICATION_ROOT_NAMESPACE-stage"
export APPLICATION_PRODUCTION_NAMESPACE="$APPLICATION_ROOT_NAMESPACE-prod"

ALL_ENVIRONMENTS_NAMESPACES="$APPLICATION_DEVELOPMENT_NAMESPACE $APPLICATION_STAGING_NAMESPACE $APPLICATION_PRODUCTION_NAMESPACE"

function environmentNamespaceConfiguration() {
  local namespace="$1"
  cat << EOF | oc -n $namespace  create -f -
apiVersion: tekton.dev/v1
kind: PipelineRun
metadata:
  generateName: rhtap-dev-namespace-setup-
spec:
  pipelineSpec:
    tasks:
      - name: configure-namespace
        taskRef:
          resolver: cluster
          params:
            - name: kind
              value: task
            - name: name
              value: rhtap-dev-namespace-setup
            - name: namespace
              value: rhtap

EOF
}

for ENVIRONMENT_NAMESPACE in $ALL_ENVIRONMENTS_NAMESPACES ; do
  oc get ns $ENVIRONMENT_NAMESPACE &> /dev/null
  ERR=$?
  if [  "$ERR" != "0" ]
  then
      oc new-project $ENVIRONMENT_NAMESPACE
      oc label namespace  $ENVIRONMENT_NAMESPACE argocd.argoproj.io/managed-by=openshift-gitops
      environmentNamespaceConfiguration $ENVIRONMENT_NAMESPACE
  else
      echo "$ENVIRONMENT_NAMESPACE exists and is labelled for gitops"
      oc label namespace  $ENVIRONMENT_NAMESPACE argocd.argoproj.io/managed-by=openshift-gitops &> /dev/null
  fi
done
