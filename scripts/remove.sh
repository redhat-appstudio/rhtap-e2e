export NS="openshift-gitops"
    RESOURCE_LIST=$(kubectl get appproject -n ${NS} --ignore-not-found -o=jsonpath='{.items[*].metadata.name}')
    for RESOURCE in $RESOURCE_LIST; do
        echo "Deleting ${RESOURCE_NAME} '${RESOURCE}' from namespace ${NS}"
        kubectl patch appproject ${RESOURCE} -n ${NS} -p '{"metadata":{"finalizers": []}}' --type=merge
        kubectl delete appproject ${RESOURCE} -n ${NS} --wait=false
    done

export NS="openshift-gitops"
    RESOURCE_LIST=$(kubectl get application -n ${NS} --ignore-not-found -o=jsonpath='{.items[*].metadata.name}')
    for RESOURCE in $RESOURCE_LIST; do
        echo "Deleting ${RESOURCE_NAME} '${RESOURCE}' from namespace ${NS}"
        kubectl patch application ${RESOURCE} -n ${NS} -p '{"metadata":{"finalizers": []}}' --type=merge
        kubectl delete application ${RESOURCE} -n ${NS} --wait=false
    done
