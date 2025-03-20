import { PipelineRunKind, TaskRunKind } from '@janus-idp/shared-react';
import { Kubernetes } from '../apis/kubernetes/kube';


export class Tekton {
    private readonly kubeClient: Kubernetes;

    /**
     * Constructs a new instance of the Tekton class.
     */
    constructor() {
        this.kubeClient = new Kubernetes();
    }

    /**
     * Returns true if taskRun script or command match given regular expression
     * 
     * @param {TaskRunKind} taskRun - TaskRun to be matched
     * @param {string} re - Regular expression to match
     * @returns {boolean} - True if taskRun script or command match regular expression, false otherwise
     */

    public regexInTask(taskRun: TaskRunKind, re: string): boolean {
        const steps = taskRun.spec.taskSpec?.steps.filter(step => step.script?.match(re) || step.command?.includes(re));
        if (!steps || steps.length === 0) {
            console.log(`Failed to locate ${re} in ${taskRun.metadata?.labels?.["tekton.dev/pipelineTask"]}`);
            return false;
        }

        return true;
    }

    /**
     * Checks pipelineRun status and that the correct tasks were executed and correct commands were used
     * 
     * @param {PipelineRunKind} pipelineRun - The PipelineRun to check
     * @param {string[]} expectedTasks - The list of tasks that are expected to be executed
     * @returns {boolean} - Returns true if correct tasks were executed and correct commands were used, false otherwise
     */
    public async checkTaskRuns(pipelineRun: PipelineRunKind, expectedTasks: string[]): Promise<boolean> {
        let result = true;

        if (!pipelineRun?.metadata?.name) {
            console.log(`Can not access name of pipelineRun: ${pipelineRun}`);
            return false;
        }

        const taskRuns = await this.kubeClient.getTaskRunsFromPipelineRun(pipelineRun.metadata.name);
        for (const taskRun of taskRuns) {
            if (!taskRun?.status?.podName) {
                console.log(`TaskRun ${taskRun.metadata?.name} failed`);
                result = false;
            }

            const taskRunName = taskRun.metadata?.labels?.["tekton.dev/pipelineTask"];
            if (taskRunName === undefined || !expectedTasks.includes(taskRunName)) {
                console.log(`Unexpected taskRun: ${taskRunName}`);
                result = false;
            }
        }

        if (taskRuns.length !== expectedTasks.length) {
            console.log(`Unexpected number of taskRuns: got ${taskRuns.length}, expected ${expectedTasks.length}`);
            result = false;
        }

        for (const [taskName, command] of [
            ['build-container', 'cosign'],
            ['acs-image-scan', 'roxctl'],
            ['acs-image-check', 'roxctl'],
            ['deploy-check', 'roxctl']]) {
            if (expectedTasks.includes(taskName)) {
                const taskRun = taskRuns.find(taskRun => taskRun.metadata?.labels?.["tekton.dev/pipelineTask"].match(taskName));
                if (taskRun === undefined) {
                    console.log(`Failed to find taskRun: ${taskName}`);
                    result = false;
                    continue;
                }
                result = result && this.regexInTask(taskRun, command);
            }
        }

        return result;
    }

    /**
     * Logs all taskRuns of a given pipelineRun.
     * @param pipelineRun - The PipelineRun to log.
     * @param namespace - The namespace of the PipelineRun.
     */
    public async logTaskRuns(pipelineRun: PipelineRunKind, namespace: string) {
        if (pipelineRun?.metadata?.name) {
            const taskRuns = await this.kubeClient.getTaskRunsFromPipelineRun(pipelineRun.metadata.name);

            for (const taskRun of taskRuns) {
                if (taskRun?.status?.podName) {
                    await this.kubeClient.readNamespacedPodLog(taskRun.status.podName, namespace);
                }
            }
        }
    }

    public async verifyPipelineRunByRepository(repositoryName: string, namespace: string, eventType: string, expectedTasks: string[]) {
        const pipelineRun = await this.kubeClient.getPipelineRunByRepository(repositoryName, eventType);
        if (pipelineRun === undefined) {
            throw new Error("Error to read pipelinerun from the cluster. Seems like pipelinerun was never created; verify PAC controller logs.");
        }
        
        // print out pipelineRun content
        console.log(`=======================PipelineRun: ${JSON.stringify(pipelineRun, null, 2)}`);
        // print out metadata of pipelineRun
        console.log(`=======================PipelineRun metadata: ${JSON.stringify(pipelineRun.metadata, null, 2)}`);
        // print out name of pipelineRun
        console.log(`=======================PipelineRun name: ${pipelineRun.metadata?.name}`);
        
        if (pipelineRun?.metadata?.name) {
            const finished = await this.kubeClient.waitPipelineRunToBeFinished(pipelineRun.metadata.name, namespace, 900000);

            await this.logTaskRuns(pipelineRun, namespace);
            return finished && await this.checkTaskRuns(pipelineRun, expectedTasks);
        }
    }
}
