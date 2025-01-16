import { beforeAll, expect, it, describe } from "@jest/globals";
import { DeveloperHubClient } from "../../../../src/apis/backstage/developer-hub";
import { TaskIdReponse } from "../../../../src/apis/backstage/types";
import { GitLabProvider } from "../../../../src/apis/git-providers/gitlab";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { generateRandomChars } from "../../../../src/utils/generator";
import { checkEnvVariablesGitLab, checkIfAcsScanIsPass, cleanAfterTestGitLab, createTaskCreatorOptionsGitlab, getDeveloperHubClient, getGitLabProvider, getRHTAPRootNamespace } from "../../../../src/utils/test.utils";

/**
 * 1. Creates a component in Red Hat Developer Hub.
 * 2. Checks that the component is successfully created in Red Hat Developer Hub.
 * 3. Red Hat Developer Hub creates a GitLab repository.
 * 4. Performs a commit in the created GitLab repository to trigger a push PipelineRun.
 * 5. Waits for PipelineRun to start and finish successfully.
 * 
 * @param softwareTemplateName The name of the software template.
 */
export const gitLabProviderBasicTests = (softwareTemplateName: string) => {
    describe(`Red Hat Trusted Application Pipeline ${softwareTemplateName} GPT tests GitLab provider with public/private image registry`, () => {
        jest.retryTimes(2);

        let backstageClient: DeveloperHubClient;
        let developerHubTask: TaskIdReponse;
        let gitLabProvider: GitLabProvider;
        let kubeClient: Kubernetes;
    
        let gitlabRepositoryID: number;
        let pipelineAsCodeRoute: string;

        let RHTAPRootNamespace: string;
        
        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || 'rhtap-app';
        const developmentNamespace = `${componentRootNamespace}-development`;
    
        const gitLabOrganization = process.env.GITLAB_ORGANIZATION || '';
        const repositoryName = `${generateRandomChars(9)}-${softwareTemplateName}`;
    
        const quayImageName = "rhtap-qe";
        const quayImageOrg = process.env.QUAY_IMAGE_ORG || '';
        const imageRegistry = process.env.IMAGE_REGISTRY || 'quay.io';
    
        beforeAll(async ()=> {
            RHTAPRootNamespace = await getRHTAPRootNamespace();
            kubeClient = new Kubernetes();
            gitLabProvider = await getGitLabProvider(kubeClient);
            backstageClient = await getDeveloperHubClient(kubeClient);

            const componentRoute = await kubeClient.getOpenshiftRoute('pipelines-as-code-controller', 'openshift-pipelines');
            pipelineAsCodeRoute = `https://${componentRoute}`;

            await checkEnvVariablesGitLab(componentRootNamespace, gitLabOrganization, quayImageOrg, developmentNamespace, kubeClient);
        })
    
        /**
        * Creates a task in Developer Hub to generate a new component using specified git and kube options.
        * 
        */
        it(`creates ${softwareTemplateName} component`, async () => {
            const taskCreatorOptions = await createTaskCreatorOptionsGitlab(softwareTemplateName, quayImageName, quayImageOrg, imageRegistry, gitLabOrganization, repositoryName, componentRootNamespace, "tekton");
        
            // Creating a task in Developer Hub to scaffold the component
            developerHubTask = await backstageClient.createDeveloperHubTask(taskCreatorOptions);
        }, 120000);
    
        /**
            * Waits for the ${softwareTemplateName} component creation task to be completed in Developer Hub.
            * If the task is not completed within the timeout, it writes logs to the specified directory.
        */
        it(`waits for ${softwareTemplateName} component creation to finish`, async () => {
            const taskCreated = await backstageClient.getTaskProcessed(developerHubTask.id, 120000)
    
            if (taskCreated.status !== 'completed') {
                console.log("Failed to create backstage task. Creating logs...");
    
                try {
                    const logs = await backstageClient.getEventStreamLog(taskCreated.id)
                    await backstageClient.writeLogsToArtifactDir('backstage-tasks-logs', `gitlab-${repositoryName}.log`, logs)
                } catch (error) {
                    throw new Error(`Failed to write logs to artifact directory: ${error}`);
                }
            } else {
                console.log("Task created successfully in backstage");
            }
        }, 120000);
    
        /**
            * Checks if Red Hat Developer Hub created the gitops repository with all our manifests for argoCd
        */
        it(`verifies if component ${softwareTemplateName} was created in GitLab and contains '.tekton' folder`, async () => {
            gitlabRepositoryID = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, repositoryName)
            expect(gitlabRepositoryID).toBeDefined()
    
            const tektonFolderExists = await gitLabProvider.checkIfRepositoryHaveFolder(gitlabRepositoryID, '.tekton')
            expect(tektonFolderExists).toBe(true)
        }, 120000)
    
        /**
            * Verifies if Red Hat Developer Hub created a repository from the specified template in GitHub.
            * The repository should contain the source code of the application and a '.tekton' folder.
        */
        it(`verifies if component ${softwareTemplateName} have a valid gitops repository and there exists a '.tekton' folder`, async () => {
            const repositoryID = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, `${repositoryName}-gitops`)
        
            const tektonFolderExists = await gitLabProvider.checkIfRepositoryHaveFolder(repositoryID, '.tekton')
            expect(tektonFolderExists).toBe(true)
        }, 120000)
    
        /**
            * Waits for the specified ArgoCD application associated with the DeveloperHub task to be synchronized in the cluster.
        */
        it(`wait ${softwareTemplateName} argocd to be synced in the cluster`, async () => {
            expect(await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000)).toBe(true);
        }, 600000);
    
        /**
            * Creates an empty commit in the repository and expect that a pipelinerun start. Bug which affect to completelly finish this step: https://issues.redhat.com/browse/RHTAPBUGS-1136
        */
        it(`Creates empty commit to trigger a pipeline run`, async ()=> {
            await gitLabProvider.createProjectWebHook(gitlabRepositoryID, pipelineAsCodeRoute);
        }, 120000)
    
        /**
            * Creates an empty commit in the repository and expect that a pipelinerun start. Bug which affect to completelly finish this step: https://issues.redhat.com/browse/RHTAPBUGS-1136
        */
        it(`Creates empty commit to trigger a pipeline run`, async ()=> {
            await gitLabProvider.createCommit(gitlabRepositoryID, 'main')    
        }, 120000)
    
        /**
            * Waits until a pipeline run is created in the cluster and start to wait until succeed/fail.
        */
        it(`Wait component ${softwareTemplateName} pipelinerun to be triggered and finished`, async ()=> {
            const pipelineRun = await kubeClient.getPipelineRunByRepository(repositoryName, 'Push')
        
            if (pipelineRun === undefined) {
                throw new Error("Error to read pipelinerun from the cluster. Seems like pipelinerun was never created; verrfy PAC controller logs.");
            }
        
            if (pipelineRun && pipelineRun.metadata && pipelineRun.metadata.name) {
                const finished = await kubeClient.waitPipelineRunToBeFinished(pipelineRun.metadata.name, developmentNamespace, 900000)
                const tskRuns = await kubeClient.getTaskRunsFromPipelineRun(pipelineRun.metadata.name)
        
                for (const iterator of tskRuns) {
                    if (iterator.status && iterator.status.podName) {
                        await kubeClient.readNamespacedPodLog(iterator.status.podName, developmentNamespace)
                    }
                }
                expect(finished).toBe(true)
            }

        }, 900000)

         /**
         * Check if the pipelinerun yaml has the rh-syft image path mentioned
         */
         it(`Check ${softwareTemplateName} pipelinerun yaml has the rh-syft image path`, async ()=> {
            const pipelineRun = await kubeClient.getPipelineRunByRepository(repositoryName, 'push')
            if (pipelineRun && pipelineRun.metadata && pipelineRun.metadata.name) {
                const doc: any = await kubeClient.pipelinerunfromName(pipelineRun.metadata.name,developmentNamespace)
                const index = doc.spec.pipelineSpec.tasks.findIndex(item => item.name === "build-container")
                const regex = new RegExp("registry.redhat.io/rh-syft-tech-preview/syft-rhel9", 'i');
                const image_index= (doc.spec.pipelineSpec.tasks[index].taskSpec.steps.findIndex(item => regex.test(item.image)))
                if (image_index)
                {
                    console.log("The image path found is " + doc.spec.pipelineSpec.tasks[index].taskSpec.steps[image_index].image )
                }
            expect(image_index).not.toBe(undefined)
            } 
        }, 900000)   
        
        /**
         * verify if the ACS Scan is successfully done from the logs of task steps
         */
        it(`Check if ACS Scan is successful for ${softwareTemplateName}`, async ()=> {
            const result = await checkIfAcsScanIsPass(repositoryName, developmentNamespace)
            expect(result).toBe(true)
            console.log("Verified as ACS Scan is Successful")
            }, 900000)

        /**
        * Deletes created applications
        */
        afterAll(async () => {
            if (process.env.CLEAN_AFTER_TESTS === 'true') {
                await cleanAfterTestGitLab(gitLabProvider, kubeClient, RHTAPRootNamespace, gitLabOrganization, gitlabRepositoryID, repositoryName)
            }
        })
    })
}
