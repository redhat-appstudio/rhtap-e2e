import { CoreV1Api, CustomObjectsApi, KubeConfig } from "@kubernetes/client-node";
import { PipelineRunKind, TaskRunKind } from '@janus-idp/shared-react';
import * as path from "node:path";
import { Utils } from "../git-providers/utils";
import { ApplicationSpec } from "./types/argo.cr.application";
import { PipelineRunList, TaskRunList } from "./types/pac.cr.pipelinerun";
import { OpenshiftRoute } from "./types/oc.routes.cr";

/**
 * Kubernetes class for interacting with Kubernetes/OpenShift clusters.
 */
export class Kubernetes extends Utils {
    private readonly kubeConfig

    /**
     * Constructs a new instance of the Kubernetes class.
     */
    constructor() {
        super()

        this.kubeConfig = new KubeConfig()
        this.kubeConfig.loadFromDefault()
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
            const response = await k8sCoreApi.readNamespace(name)

            if (response.body && response.body.metadata && response.body.metadata.name === name) {
                return true
            }

            return false
        } catch (error) {
            console.error(error)
            return false
        }
    }

    /**
     * Waits for a specified duration.
     * 
     * @param {number} timeoutMs - The duration to wait in milliseconds.
     * @returns {Promise<void>} A Promise that resolves once the specified duration has elapsed.
     */
    public async getTaskRunsFromPipelineRun(pipelineRunName: string):Promise<TaskRunKind[]> {
        const customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi);
        try {
            const { body: taskRunList } = await customObjectsApi.listClusterCustomObject('tekton.dev', 'v1', 'taskruns');
            const taskRunInterface = taskRunList as TaskRunList;
            return taskRunInterface.items.filter(taskRun =>
                taskRun.metadata && taskRun.metadata.name && taskRun.metadata.name.startsWith(pipelineRunName));

        } catch (error) {
            console.error(error)
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
            const route = openshiftRoute as OpenshiftRoute

            return route.spec.host

        } catch (error) {
            console.error(error)
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
            if (pod.spec && pod.spec.containers) {
                // Iterate over each container in the pod
                for (const container of pod.spec.containers) {
                    // Get logs from each container
                    const response = await k8sApi.readNamespacedPodLog(podName, namespace, container.name);

                    // Append container name before the logs
                    const logsWithContainerInfo = `Container: ${container.name}\n${response.body}\n\n`;
                    const logFilePath = path.join('taskruns-logs', podName)
                    await this.writeLogsToArtifactDir(logFilePath, `${container.name}.log`, logsWithContainerInfo )
                }
    
            } else {
                console.error(`Pod ${podName} in namespace ${namespace} does not have spec or containers defined.`);
            }
        } catch (err) {
            console.error('Error:', err);
        }
    }

    /**
     * Retrieves the most recent PipelineRun associated with a GitHub repository.
     * 
     * @param {string} gitHubRepository - The name of the GitHub repository.
     * @returns {Promise<PipelineRunKind | undefined>} A Promise resolving to the most recent PipelineRun associated with the repository, or undefined if no PipelineRun is found.
     * @throws This function may throw errors during API calls or retries.
     */
    public async getPipelineRunByRepository(gitHubRepository: string, enventType: string): Promise<PipelineRunKind | undefined> {
        const customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
        const maxAttempts = 10;
        const retryInterval = 10 * 1000

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const { body } = await customObjectsApi.listClusterCustomObject('tekton.dev', 'v1', 'pipelineruns',
                    undefined, undefined, undefined, undefined, `pipelinesascode.tekton.dev/url-repository=${gitHubRepository}, pipelinesascode.tekton.dev/event-type=${enventType}`);
                const pr = body as PipelineRunList;
                // !TODO: Return most recent pipelinerun found
                if (pr.items.length > 0) {
                    console.log(`Found pipeline run ${pr.items[0].metadata!.name}`);

                    return pr.items[0];
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

        console.error('Max attempts reached. Unable to fetch pipeline runs.');

        return undefined;
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
    
                if (pr.status && pr.status.conditions) {
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
                console.error('Error fetching pipeline run: retrying');
                // You might handle specific errors differently here
            }
    
            await this.sleep(Math.min(retryInterval, timeoutMs - totalTimeMs)); // Adjust retry interval based on remaining timeout
            totalTimeMs += retryInterval;
        }

        throw new Error(`Timeout reached waiting for pipeline run '${name}' to finish.`);
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
                const { body } = await customObjectsApi.getNamespacedCustomObject('argoproj.io', 'v1alpha1', 'rhtap', 'applications', name);
                const application = body as ApplicationSpec;

                if (application.status && application.status.sync && application.status.sync.status &&
                    application.status.health && application.status.health.status) {
    
                    if (application.status.sync.status === 'Synced' && application.status.health.status === 'Healthy') {
                        return true;
                    }
                } else {
                    await this.sleep(retryInterval);
                    totalTimeMs += retryInterval;
                    continue;
                }
            } catch (error) {
                console.info('Error fetching argo application : retrying');
            }
        
            await this.sleep(Math.min(retryInterval, timeoutMs - totalTimeMs)); // Adjust retry interval based on remaining timeout
            totalTimeMs += retryInterval;
        }

        console.error(`Timeout reached waiting for application '${name}' to be healthy.`);
        return false;
    }
}
