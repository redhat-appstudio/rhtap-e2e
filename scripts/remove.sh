# Get a list of resource names in the namespace
resource_names=$(kubectl get applications -n rhtap -o jsonpath='{.items[*].metadata.name}')

# Loop through each resource and remove finalizers
for resource_name in $resource_names; do
    kubectl patch application $resource_name -n rhtap --type merge -p '{"metadata":{"finalizers":null}}'
done