import { CoreV1Api, CustomObjectsApi, dumpYaml, KubeConfig, loadYaml, V1ObjectMeta } from "@kubernetes/client-node";
import { PipelineRunKind, TaskRunKind } from '@janus-idp/shared-react';
import * as path from "node:path";
import { Utils } from "../scm-providers/utils";
import { ApplicationSpec } from "./types/argo.cr.application";
import { PipelineRunList, TaskRunList } from "./types/pac.cr.pipelinerun";
import { OpenshiftRoute } from "./types/oc.routes.cr";

/**
 * Constants for interacting with Kubernetes/OpenShift clusters.
 */
const RHTAPGitopsNamespace = process.env.RHTAP_GITOPS_NAMESPACE ??'rhtap-gitops';

/**
 * Kubernetes class for interacting with Kubernetes/OpenShift clusters.
 */
export class Kubernetes extends Utils {

    private readonly kubeConfig;

    /**
     * Constructs a new instance of the Kubernetes class.
     */
    constructor() {
        super();
        this.kubeConfig = new KubeConfig();
        this.kubeConfig.loadFromDefault();
    }

    /**
     * Checks if a namespace exists in the Kubernetes/Openshift cluster.
     * 
     * @param {string} name - The name of the namespace to check.
     * @returns {Promise<boolean>} A Promise that resolves to true if the namespace exists, otherwise false.
     */
    public async namespaceExists(name: string): Promise<boolean> {
        const k8sCoreApi = this.kubeConfig.makeApiClient(CoreV1Api);
        try {
            const response = await k8sCoreApi.readNamespace(name);
            if (response?.body?.metadata?.name === name) {
                return true;
            }

            return false;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    /**
     * Waits for a specified duration.
     * 
     * @param {number} timeoutMs - The duration to wait in milliseconds.
     * @returns {Promise<void>} A Promise that resolves once the specified duration has elapsed.
     */
    public async getTaskRunsFromPipelineRun(pipelineRunName: string): Promise<TaskRunKind[]> {
        const customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi);
        try {
            const { body: taskRunList } = await customObjectsApi.listClusterCustomObject('tekton.dev', 'v1', 'taskruns');
            const taskRunInterface = taskRunList as TaskRunList;
            return taskRunInterface.items.filter(taskRun => taskRun?.metadata?.name?.startsWith(pipelineRunName));

        } catch (error) {
            console.error(error);
            throw new Error(`Failed to obtain task run from pipelinerun ${pipelineRunName}: ${error}`);
        }
    }

    /**
     * Waits for a specified duration.
     * 
     * @param {number} timeoutMs - The duration to wait in milliseconds.
     * @returns {Promise<void>} A Promise that resolves once the specified duration has elapsed.
     */
    public async getOpenshiftRoute(name: string, namespace: string): Promise<string> {
        const customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi);
        try {
            const { body: openshiftRoute } = await customObjectsApi.getNamespacedCustomObject('route.openshift.io', 'v1', namespace, 'routes', name);
            const route = openshiftRoute as OpenshiftRoute;

            return route.spec.host;

        } catch (error) {
            console.error(error);
            throw new Error(`Failed to obtain openshift route ${name}: ${error}`);
        }
    }

    /**
     * Reads logs from all containers within a specified pod in a given namespace and writes them to artifact files.
     * 
     * @param {string} podName - The name of the pod.
     * @param {string} namespace - The namespace where the pod is located.
     * @returns {Promise<void>} A Promise that resolves once the logs are read and written to artifact files.
     */
    async readNamespacedPodLog(podName: string, namespace: string): Promise<void> {
        const k8sApi = this.kubeConfig.makeApiClient(CoreV1Api);
        try {
            // Get the pod object
            const { body: pod } = await k8sApi.readNamespacedPod(podName, namespace);

            // Check if pod.spec is defined
            if (pod.spec?.containers) {
                // Iterate over each container in the pod
                for (const container of pod.spec.containers) {
                    // Get logs from each container
                    const response = await k8sApi.readNamespacedPodLog(podName, namespace, container.name);

                    // Append container name before the logs
                    const logsWithContainerInfo = `Container: ${container.name}\n${response.body}\n\n`;
                    const logFilePath = path.join('taskruns-logs', podName);
                    await this.writeLogsToArtifactDir(logFilePath, `${container.name}.log`, logsWithContainerInfo);
                }

            } else {
                console.error(`Pod ${podName} in namespace ${namespace} does not have spec or containers defined.`);
            }
        } catch (err) {
            console.error('Error:', err);
        }
    }

    /**
     * Reads logs from a particular container from a specified pod and namespace and return logs
     *
     * @param {string} podName - The name of the pod.
     * @param {string} namespace - The namespace where the pod is located.
     * @param {string} ContainerName - The name of the Container.
     * @returns {Promise<any>} A Promise that resolves once the logs are read and written to artifact files and return logs
     */
    async readContainerLogs(podName: string, namespace: string, containerName: string): Promise<unknown> {
        const k8sApi = this.kubeConfig.makeApiClient(CoreV1Api);
        try {
            // Get logs from the given container
            const response = await k8sApi.readNamespacedPodLog(podName, namespace, containerName);
            return (response.body);
        } catch (err) {
            console.error('Error:', err);
        }
    }

    /**
     * Retrieves the most recent PipelineRun associated with a GitHub/GitLab repository.
     * 
     * @param {string} gitRepository - The name of the GitHub/GitLab repository.
     * @returns {Promise<PipelineRunKind | undefined>} A Promise resolving to the most recent PipelineRun associated with the repository, or undefined if no PipelineRun is found.
     * @throws This function may throw errors during API calls or retries.
     */
    public async getPipelineRunByRepository(gitRepository: string, eventType: string): Promise<PipelineRunKind | undefined> {
        const customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi);
        const maxAttempts = 10;
        const retryInterval = 10 * 1000;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const { body } = await customObjectsApi.listClusterCustomObject('tekton.dev', 'v1', 'pipelineruns',
                    undefined, undefined, undefined, undefined, `pipelinesascode.tekton.dev/url-repository=${gitRepository}`);
                const pr = body as PipelineRunList;

                const filteredPipelineRuns = pr.items.filter((pipelineRun: PipelineRunKind) => {
                    const metadata: V1ObjectMeta | undefined = pipelineRun.metadata;
                    if (!metadata) {
                        return false;
                    }
                    const labels = metadata.labels;

                    return labels?.['pipelinesascode.tekton.dev/event-type'] === eventType;
                });

                if (filteredPipelineRuns.length > 0) {
                    console.log(`Found pipeline run ${filteredPipelineRuns[0].metadata?.name}`);

                    return filteredPipelineRuns[0];
                } else {
                    await this.sleep(retryInterval);
                }
            } catch (error) {
                console.error(`Error fetching pipeline runs (Attempt ${attempt}):`, error);
                if (attempt < maxAttempts) {
                    console.log(`Retrying in ${retryInterval / 1000} seconds...`);
                    await this.sleep(retryInterval);
                } else {
                    throw error;
                }
            }
        }

        throw new Error(`Max attempts reached. Unable to fetch pipeline runs for your component in cluster for ${gitRepository}. Check Openshift Pipelines resources...`);
    }

    /**
     * Waits for a Tekton PipelineRun to finish in a specified namespace.
     * 
     * @param {string} name - The name of the PipelineRun to monitor.
     * @param {string} namespace - The namespace where the PipelineRun is located.
     * @param {number} timeoutMs - The maximum time to wait for the PipelineRun to finish, in milliseconds.
     *                             If set to 0, the function will wait indefinitely.
     * @returns {Promise<boolean>} A Promise resolving to true if the PipelineRun finishes successfully within the specified timeout, otherwise false.
     * @throws This function does not throw directly, but may throw errors during API calls or retries.
     */
    public async waitPipelineRunToBeFinished(name: string, namespace: string, timeoutMs: number): Promise<boolean> {
        const customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi);
        const retryInterval = 10 * 1000;
        let totalTimeMs = 0;

        while (timeoutMs === 0 || totalTimeMs < timeoutMs) {
            try {
                const { body } = await customObjectsApi.getNamespacedCustomObject('tekton.dev', 'v1', namespace, 'pipelineruns', name);
                const pr = body as PipelineRunKind;

                if (pr.status?.conditions) {
                    const pipelineHasFinishedSuccessfully = pr.status.conditions.some(
                        (condition) => condition.status === 'True' && condition.type === 'Succeeded'
                    );
                    const pipelineHasFailed = pr.status.conditions.some(
                        (condition) => condition.status === 'False' && condition.reason === 'Failed'
                    );

                    if (pipelineHasFinishedSuccessfully) {
                        console.log(`Pipeline run '${name}' finished successfully.`);
                        return true;
                    } else if (pipelineHasFailed) {
                        console.error(`Pipeline run '${name}' failed.`);
                        return false;
                    }
                }
            } catch (error) {
                console.error('Error fetching pipeline run: retrying', error);
                // You might handle specific errors differently here
            }

            await this.sleep(Math.min(retryInterval, timeoutMs - totalTimeMs)); // Adjust retry interval based on remaining timeout
            totalTimeMs += retryInterval;
        }
        throw new Error(`Timeout reached waiting for pipeline run '${name}' to finish.`);
    }

    /**
     * Accepts the pipelinerun name and fetches pipelinerun yaml output.
     * Returns the yaml value in the variable 'doc'
     * @param {string} namespace - The namespace default value is rhtap-app-development.
     * @param {string} name - The name of the pipelinerun
     * @throws This function does not throw directly, but may throw errors during API calls or retries.
     */
    public async pipelinerunfromName(name: string, namespace: string) {
        try {
            const k8sCoreApi = this.kubeConfig.makeApiClient(CustomObjectsApi);
            const plr = await k8sCoreApi.getNamespacedCustomObject(
                'tekton.dev',
                'v1',
                namespace,
                'pipelineruns',
                name
            );
            const plrYaml = dumpYaml(plr.body);
            const doc = loadYaml(plrYaml);
            return doc;
        }
        catch (error) { console.error('Error fetching PipelineRuns: ', error); }
    }

    /**
     * Waits for an Argo CD application to become healthy.
     * 
     * @param {string} name - The name of the Argo CD application to check.
     * @param {number} timeoutMs - The maximum time to wait for the application to become healthy, in milliseconds.
     *                             If set to 0, the function will wait indefinitely.
     * @returns {Promise<boolean>} A Promise resolving to true if the application becomes healthy within the specified timeout, otherwise false.
     * @throws This function does not throw directly, but may throw errors during API calls or retries.
     */
    public async waitForArgoCDApplicationToBeHealthy(name: string, timeoutMs: number): Promise<boolean> {
        const customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi);
        const retryInterval = 10 * 1000;
        let totalTimeMs = 0;

        while (timeoutMs === 0 || totalTimeMs < timeoutMs) {
            try {
                const { body } = await customObjectsApi.getNamespacedCustomObject('argoproj.io', 'v1alpha1', RHTAPGitopsNamespace, 'applications', name);
                const application = body as ApplicationSpec;

                if (application.status?.sync?.status &&
                    application.status.health?.status) {

                    if (application.status.sync.status === 'Synced' && application.status.health.status === 'Healthy') {
                        return true;
                    }
                } else {
                    await this.sleep(retryInterval);
                    totalTimeMs += retryInterval;
                    continue;
                }
            } catch (_) {
                console.info('Error fetching argo application : retrying');
            }

            await this.sleep(Math.min(retryInterval, timeoutMs - totalTimeMs)); // Adjust retry interval based on remaining timeout
            totalTimeMs += retryInterval;
        }

        throw new Error(`Timeout reached waiting for application '${name}' to be healthy. Check argocd console for application health.`);
    }

    /**
     * Patches Argo CD application and deletes it.
     * 
     * @param {string} namespace - The name of the Argo CD application to check.
     * @param {string} applicationName - The name of the Argo CD application to check.
     * @throws This function does not throw directly, but may throw errors during API calls or retries.
     */
    public async deleteApplicationFromNamespace(namespace: string, applicationName: string) {
        try {
            const k8sCoreApi = this.kubeConfig.makeApiClient(CustomObjectsApi);

            // Define the patch object
            const patchObject = {
                metadata: {
                    finalizers: ['resources-finalizer.argocd.argoproj.io']
                }
            };

            // Define the options
            const options = { headers: { 'Content-Type': 'application/merge-patch+json' } };

            // Patch the app
            await k8sCoreApi.patchNamespacedCustomObject('argoproj.io', 'v1alpha1', namespace, 'applications', applicationName, patchObject, undefined, undefined, undefined, options);

            // Delete the app
            await k8sCoreApi.deleteNamespacedCustomObject('argoproj.io', 'v1alpha1', namespace, 'applications', applicationName);

            console.log(`App ${applicationName} patched and deleted successfully.`);
        } catch (error) {
            throw new Error(`Error when deleting application '${applicationName}' from namespace '${namespace}': '${error}'`);
        }
    }


    /**
     * Gets value of the key in secret in namespace.
     * 
     * @param {string} namespace - The namespace where the secret is located.
     * @param {string} secretName - The name of the secret.
     * @param {string} keyName - The kay of the secret.
     * @returns {Promise<string>} Returns secret value.
     */
    public async getDeveloperHubSecret(namespace: string, secretName: string, keyName: string): Promise<string> {
        const k8sApi = this.kubeConfig.makeApiClient(CoreV1Api);
        try {
            // Fetch the secret from the specified namespace
            const secret = await k8sApi.readNamespacedSecret(secretName, namespace);

            // Check if the key exists in the secret data
            if (secret.body.data && secret.body?.data[keyName]) {
                // Decode the base64 encoded secret value
                const secretValue = Buffer.from(secret.body.data[keyName], 'base64').toString('utf-8');
                return secretValue;
            } else {
                console.error(`Key ${keyName} not found in secret ${secretName}`);
                return "";
            }

        } catch (err) {
            console.error(`Error fetching secret ${secretName}: ${err}`);
            return "";
        }
    }

    public async getSecretPartialName(namespace: string, partialSecretName: string, key: string, decode = true): Promise<string> {
        try {
            const k8sApi = this.kubeConfig.makeApiClient(CoreV1Api);

            // List all secrets
            const secretList = await k8sApi.listNamespacedSecret(namespace);

            // Filter secrets
            const matchingSecrets = secretList.body.items.filter(secret => secret.metadata?.name?.startsWith(partialSecretName));

            if (matchingSecrets.length === 0) {
                console.error(`No secrets found with prefix ${partialSecretName}`);
                return "";
            }

            // Use first match
            const secret = matchingSecrets[0];

            // Check if the key exists in the secret data
            if (secret.data && secret.data[key]) {
                // Decode the base64 encoded secret value
                if (decode) {
                    return Buffer.from(secret.data[key], 'base64').toString('utf-8');
                } else {
                    return secret.data[key];
                }

            } else {
                console.error(`Key ${key} not found in secret ${secret.metadata?.name}`);
                return "";
            }
        } catch (err) {
            console.error(`Error fetching secret with partial name ${partialSecretName}: ${err}`);
            return "";
        }
    }

    /**
    * Gets route for developer hub.
    * 
    * @param {string} namespace - The namespace where the route is located.
    * @returns {Promise<string>}  - returns route URL.
    */
    public async getDeveloperHubRoute(namespace: string): Promise<string> {
        // Custom resource definition (CRD) API for OpenShift Route (route.openshift.io)
        const k8sCustomApi = this.kubeConfig.makeApiClient(CustomObjectsApi);
        try {
            // Get the route object from the OpenShift cluster
            const route = await k8sCustomApi.getNamespacedCustomObject(
                'route.openshift.io',
                'v1',
                namespace,
                'routes',
                'backstage-developer-hub'
            );

            // Extract the host from the route object
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const routeSpec = (route.body as any).spec;
            const host = routeSpec.host;

            if (host) {
                return `https://${host}`;
            } else {
                console.error(`Host not found in route backstage-developer-hub`);
                return "";
            }
        } catch (err) {
            console.error(`Error fetching route backstage-developer-hub: ${err}`);
            return "";
        }
    }

    /**
    * Gets cosign public key.
    */
    public async getCosignPublicKey(): Promise<string> {
        return this.getSecretPartialName("openshift-pipelines", "signing-secrets", "cosign.pub", false);
    }

    /**
    * Gets cosign private key.
    */
    public async getCosignPrivateKey(): Promise<string> {
        return this.getSecretPartialName("openshift-pipelines", "signing-secrets", "cosign.key", false);
    }

    /**
    * Gets cosign password.
    */
    public async getCosignPassword(): Promise<string> {
        return this.getSecretPartialName("openshift-pipelines", "signing-secrets", "cosign.password", false);
    }

    /**
    * Gets ACS endpoint.
    * 
    * @param {string} namespace - The namespace where the route is located.
    * @returns {Promise<string>}  - returns route URL.
    */
    public async getACSEndpoint(namespace: string): Promise<string> {
        return this.getDeveloperHubSecret(namespace, "rhtap-acs-integration", "endpoint");
    }

    /**
    * Gets ACS token.
    * 
    * @param {string} namespace - The namespace where the route is located.
    * @returns {Promise<string>}  - returns token.
    */
    public async getACSToken(namespace: string): Promise<string> {
        return this.getDeveloperHubSecret(namespace, "rhtap-acs-integration", "token");
    }

    /**
    * Gets rekor URL.
    * 
    * @param {string} namespace - The namespace where the route is located.
    * @returns {Promise<string>}  - returns route URL.
    */
    public async getRekorServerUrl(namespace: string): Promise<string> {
        return this.getDeveloperHubSecret(namespace, "rhtap-tas-integration", "rekor_url");
    }

    /**
    * Gets TUF URL.
    * 
    * @param {string} namespace - The namespace where the route is located.
    * @returns {Promise<string>}  - returns route URL.
    */
    public async getTUFUrl(namespace: string): Promise<string> {
        return this.getDeveloperHubSecret(namespace, "rhtap-tas-integration", "tuf_url");
    }

    /**
     * Returns the pod yaml file given podname and namespace
     * 
     * @param {string} PodName - The name of the pod
     * @returns {Promise<boolean>} A Promise that resolves to true if the namespace exists, otherwise false.
     */
    public async getPodYaml(PodName: string, nameSpace: string): Promise<string | null> {
        const k8sCoreApi = this.kubeConfig.makeApiClient(CoreV1Api);
        try {
            const response = await k8sCoreApi.readNamespacedPod(PodName, nameSpace);
            const podYaml = dumpYaml(response.body);
            return podYaml;
        }
        catch (error) {
            console.error('Error fetching pod:', error);
            return null;
        }
    }

    /**
    * Gets bombastic api URL.
    * 
    * @param {string} namespace - The namespace where the route is located.
    * @returns {Promise<string>}  - returns route URL.
    */
    public async getTTrustificationBombasticApiUrl(namespace: string): Promise<string> {
        return this.getDeveloperHubSecret(namespace, "rhtap-trustification-integration", "bombastic_api_url");
    }

    /**
    * Gets oidc issuer URL.
    * 
    * @param {string} namespace - The namespace where the route is located.
    * @returns {Promise<string>}  - returns route URL.
    */
    public async getTTrustificationOidcIssuerUrl(namespace: string): Promise<string> {
        return this.getDeveloperHubSecret(namespace, "rhtap-trustification-integration", "oidc_issuer_url");
    }

    /**
    * Gets oidc client ID.
    * 
    * @param {string} namespace - The namespace where the route is located.
    * @returns {Promise<string>}  - returns route URL.
    */
    public async getTTrustificationClientId(namespace: string): Promise<string> {
        return this.getDeveloperHubSecret(namespace, "rhtap-trustification-integration", "oidc_client_id");
    }

    /**
    * Gets oidc client secret.
    * 
    * @param {string} namespace - The namespace where the route is located.
    * @returns {Promise<string>}  - returns route URL.
    */
    public async getTTrustificationClientSecret(namespace: string): Promise<string> {
        return this.getDeveloperHubSecret(namespace, "rhtap-trustification-integration", "oidc_client_secret");
    }

    /**
    * Gets supported cyclone dx version.
    * 
    * @param {string} namespace - The namespace where the route is located.
    * @returns {Promise<string>}  - returns route URL.
    */
    public async getTTrustificationSupportedCycloneDXVersion(namespace: string): Promise<string> {
        return this.getDeveloperHubSecret(namespace, "rhtap-trustification-integration", "supported_cyclonedx_version");
    }
}
