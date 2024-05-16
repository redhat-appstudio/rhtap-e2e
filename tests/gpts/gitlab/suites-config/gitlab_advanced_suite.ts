import { ScaffolderScaffoldOptions } from "@backstage/plugin-scaffolder-react";
import { DeveloperHubClient } from "../../../../src/apis/backstage/developer-hub";
import { TaskIdReponse } from "../../../../src/apis/backstage/types";
import { GitLabProvider } from "../../../../src/apis/git-providers/gitlab";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { generateRandomName } from "../../../../src/utils/generator";
import { syncArgoApplication } from "../../../../src/utils/argocd";
import { cleanAfterTestGitLab } from "../../../../src/utils/test.utils";

/**
    * Advanced end-to-end test scenario for Red Hat Trusted Application Pipelines GitLab Provider:
    * 1. Create components in Red Hat Developer Hub.
    * 2. Verify successful creation of components in Red Hat Developer Hub.
    * 3. Ensure Red Hat Developer Hub creates a corresponding GitLab repository.
    * 4. Initiate a Pull Request to trigger a PipelineRun for pull_request events in the GitLab repository.
    * 5. Merge the Pull Request if the PipelineRun succeeds.
    * 6. Upon merging the Pull Request, validate that the push PipelineRun starts and finishes successfully.
    * 7. Verify that the new image is deployed correctly in the development environment.
    * 8. Trigger a Pull Request in the component gitops folder to promote the development image to the stage environment.
    * 9. Ensure that the EC Pipeline Runs are successfully passed.
    * 10. Merge the Pull Request to main.
    * 11. Wait for the new image to be deployed to the stage environment.
    * 12. Trigger a Pull Request in the component gitops repository to promote the stage image to the production environment.
    * 13. Verify that the EC Pipeline Runs are successfully passed.
    * 14. Merge the Pull Request to main.
    * 15. Wait for the new image to be deployed to the production environment.
 */
export const gitLabSoftwareTemplatesAdvancedScenarios = (softwareTemplateName: string) => {
    describe(`Advanced Red Hat Trusted Application Pipeline ${softwareTemplateName} tests GitLab provider with public/private image registry`, () => {
        let backstageClient: DeveloperHubClient;
        let developerHubTask: TaskIdReponse;
        let gitLabProvider: GitLabProvider;
        let kubeClient: Kubernetes;

        let gitlabRepositoryID: number;
        let gitlabGitopsRepositoryID: number;
        let mergeRequestNumber: number;
        let gitopsPromotionMergeRequestNumber: number;
        let pipelineAsCodeRoute: string;

        const developmentEnvironmentName = 'development';
        const stagingEnvironmentName = 'stage';
        const productionEnvironmentName = 'prod';
        const quayImageName = "rhtap-qe";

        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || '';
        const RHTAPRootNamespace = process.env.RHTAP_ROOT_NAMESPACE || 'rhtap';
        const developmentNamespace = `${componentRootNamespace}-development`;
        const stageNamespace = `${componentRootNamespace}-${stagingEnvironmentName}`;
        const prodNamespace = `${componentRootNamespace}-${productionEnvironmentName}`;

        const gitLabOrganization = process.env.GITLAB_ORGANIZATION || '';
        const repositoryName = `${generateRandomName()}-${softwareTemplateName}`;

        const quayImageOrg = process.env.QUAY_IMAGE_ORG || '';
        
        beforeAll(async ()=> {
            backstageClient = new DeveloperHubClient();
            gitLabProvider = new GitLabProvider()
            kubeClient = new Kubernetes()

            const componentRoute = await kubeClient.getOpenshiftRoute('pipelines-as-code-controller', 'openshift-pipelines');
            pipelineAsCodeRoute = `https://${componentRoute}`;

            if (componentRootNamespace === '') {
                throw new Error("The 'APPLICATION_TEST_NAMESPACE' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
            }

            if (gitLabOrganization === '') {
                throw new Error("The 'GITLAB_ORGANIZATION' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
            }

            if (quayImageOrg === '') {
                throw new Error("The 'QUAY_IMAGE_ORG' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
            }

            const namespaceExists = await kubeClient.namespaceExists(developmentNamespace)

            if (!namespaceExists) {
                throw new Error(`The development namespace was not created. Make sure you have created ${developmentNamespace} is created and all secrets are created. Example: 'https://github.com/jduimovich/rhdh/blob/main/default-rhtap-ns-configure'`);
            }
        })

        /**
            * Creates a task in Developer Hub to generate a new component using specified git and kube options.
            * 
            * @param {string} templateRef Refers to the Developer Hub template name.
            * @param {object} values Set of options to create the component.
            * @param {string} values.branch Default git branch for the component.
            * @param {string} values.gitlabServer GitLab server URL.
            * @param {string} values.hostType Type of host (e.g., GitLab).
            * @param {string} values.imageName Registry image name for the component to be pushed.
            * @param {string} values.imageOrg Registry organization name for the component to be pushed.
            * @param {string} values.imageRegistry Image registry provider. Default is Quay.io.
            * @param {string} values.name Name of the repository to be created in GitLab.
            * @param {string} values.namespace Kubernetes namespace where ArgoCD will create component manifests.
            * @param {string} values.owner Developer Hub username who initiates the task.
            * @param {string} values.repoName Name of the GitLab repository.
            * @param {string} values.repoOwner Owner of the GitLab repository.
        */
        it(`creates ${softwareTemplateName} component`, async () => {
            const taskCreatorOptions: ScaffolderScaffoldOptions = {
                templateRef: `template:default/${softwareTemplateName}`,
                values: {
                    branch: 'main',
                    gitlabServer: 'gitlab.com',
                    hostType: 'GitLab',
                    imageName: quayImageName,
                    imageOrg: quayImageOrg,
                    imageRegistry: 'quay.io',
                    name: repositoryName,
                    namespace: componentRootNamespace,
                    owner: "user:guest",
                    repoName: repositoryName,
                    repoOwner: gitLabOrganization
                }
            };

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
            * Checks if Red Hat Developer Hub created the gitops repository with all manifests for argoCD
        */
        it(`verifies if component ${softwareTemplateName} was created in GitLab and contains '.tekton' folder`, async () => {
            gitlabRepositoryID = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, repositoryName)
            expect(gitlabRepositoryID).toBeDefined()
        
            const tektonFolderExists = await gitLabProvider.checkIfRepositoryHaveFolder(gitlabRepositoryID, '.tekton')
            expect(tektonFolderExists).toBe(true)
        })

        /**
            * Verifies if Red Hat Developer Hub created a repository from the specified template in GitLab.
            * The repository should contain the source code of the application and a '.tekton' folder.
        */
        it(`verifies if component ${softwareTemplateName} have a valid gitops repository and there exists a '.tekton' folder`, async () => {
            gitlabGitopsRepositoryID = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, `${repositoryName}-gitops`)
            expect(gitlabGitopsRepositoryID).toBeDefined()

            const tektonFolderExists = await gitLabProvider.checkIfRepositoryHaveFolder(gitlabGitopsRepositoryID, '.tekton')
            expect(tektonFolderExists).toBe(true)
        })

        /**
            * Waits for the specified ArgoCD application associated with the DeveloperHub task to be synchronized in the cluster.
        */
        it(`wait ${softwareTemplateName} argocd to be synced in the cluster`, async () => {
            expect(await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000)).toBe(true);
        }, 600000);

        /**
            * Creates an empty commit in the repository and expect that a pipelinerun start. Bug which affect to completelly finish this step: https://issues.redhat.com/browse/RHTAPBUGS-1136
        */
        it(`creates WebHook for ${softwareTemplateName} projects: git project and gitops project`, async ()=> {
            await gitLabProvider.createProjectWebHook(gitlabRepositoryID, pipelineAsCodeRoute);
            await gitLabProvider.createProjectWebHook(gitlabGitopsRepositoryID, pipelineAsCodeRoute);
        }, 120000)

        /**
            * Creates an empty commit in the repository and expect that a pipelinerun start. Bug which affect to completelly finish this step: https://issues.redhat.com/browse/RHTAPBUGS-1136
        */
        it(`creates a Merge Request for ${softwareTemplateName} component and check if pipeline run finish successfull`, async ()=> {
            const mergeRequestTitleName = 'Automatic Merge Request created from testing framework';

            mergeRequestNumber = await gitLabProvider.createMergeRequest(gitlabRepositoryID, generateRandomName(), mergeRequestTitleName);
            expect(mergeRequestNumber).toBeDefined()

            const pipelineRun = await kubeClient.getPipelineRunByRepository(repositoryName, 'Merge_Request')

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
            * Merges a merge request and waits until a pipeline run push is created in the cluster and start to wait until succeed/fail.
        */
        it(`merge merge request for component ${softwareTemplateName} and waits until push pipelinerun finished successfully`, async ()=> {
            await gitLabProvider.mergeMergeRequest(gitlabRepositoryID, mergeRequestNumber)

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
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster
         */
        it('container component is successfully synced by gitops in development environment', async ()=> {
            console.log("syncing argocd application in development environment")
            await syncArgoApplication('rhtap', `${repositoryName}-${developmentEnvironmentName}`)
        
            const componentRoute = await kubeClient.getOpenshiftRoute(repositoryName, developmentNamespace)
        
            const isReady = await backstageClient.waitUntilComponentEndpointBecomeReady(`https://${componentRoute}/hello-resteasy`, 10 * 60 * 1000)
        
            if (!isReady) {
                throw new Error("Component seems was not synced by ArgoCD in 10 minutes");
            }

        }, 900000)

        /**
        * Trigger a promotion Pull Request in Gitops repository to promote stage image to prod environment
        */
        it('trigger pull request promotion to promote from development to stage environment', async ()=> {
            gitopsPromotionMergeRequestNumber = await gitLabProvider.createMergeRequestWithPromotionImage(gitlabGitopsRepositoryID, generateRandomName(),
                repositoryName, developmentEnvironmentName, stagingEnvironmentName);
            expect(gitopsPromotionMergeRequestNumber).toBeDefined()

            const pipelineRun = await kubeClient.getPipelineRunByRepository(`${repositoryName}-gitops`, 'Merge_Request')

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
            * Merge the gitops Pull Request with the new image value. Expect that argocd will sync the new image in stage 
        */
        it(`merge gitops pull request to sync new image in stage environment`, async ()=> {
            await gitLabProvider.mergeMergeRequest(gitlabGitopsRepositoryID, gitopsPromotionMergeRequestNumber)
        }, 120000)

        /*
            * Verifies if the new image is deployed with an expected endpoint in stage environment
        */
        it('container component is successfully synced by gitops in stage environment', async ()=> {
            console.log("syncing argocd application in stage environment")
            await syncArgoApplication(RHTAPRootNamespace, `${repositoryName}-${stagingEnvironmentName}`)
        
            const componentRoute = await kubeClient.getOpenshiftRoute(repositoryName, stageNamespace)
        
            const isReady = await backstageClient.waitUntilComponentEndpointBecomeReady(`https://${componentRoute}/hello-resteasy`, 10 * 60 * 1000)
        
            if (!isReady) {
                throw new Error("Component seems was not synced by ArgoCD in 10 minutes");
            }
        }, 900000)

        /**
            * Trigger a promotion Pull Request in Gitops repository to promote stage image to prod environment
        */
        it('trigger pull request promotion to promote from stage to prod environment', async ()=> {
            gitopsPromotionMergeRequestNumber = await gitLabProvider.createMergeRequestWithPromotionImage(gitlabGitopsRepositoryID, generateRandomName(),
                repositoryName, stagingEnvironmentName, productionEnvironmentName);
            expect(gitopsPromotionMergeRequestNumber).toBeDefined()
        
            const pipelineRun = await kubeClient.getPipelineRunByRepository(`${repositoryName}-gitops`, 'Merge_Request')
        
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
            * Merge the gitops Pull Request with the new image value. Expect that argocd will sync the new image in stage 
        */
        it.skip(`merge gitops pull request to sync new image in prod environment`, async ()=> {
            await gitLabProvider.mergeMergeRequest(gitlabGitopsRepositoryID, gitopsPromotionMergeRequestNumber)
        }, 120000)

        /*
            * Verifies if the new image is deployed with an expected endpoint in stage environment
        */
        it.skip('container component is successfully synced by gitops in prod environment', async ()=> {
            console.log("syncing argocd application in prod environment")
            await syncArgoApplication('rhtap', `${repositoryName}-${productionEnvironmentName}`)
                
            const componentRoute = await kubeClient.getOpenshiftRoute(repositoryName, prodNamespace)
                
            const isReady = await backstageClient.waitUntilComponentEndpointBecomeReady(`https://${componentRoute}/hello-resteasy`, 10 * 60 * 1000)
                
            if (!isReady) {
                throw new Error("Component seems was not synced by ArgoCD in 10 minutes");
            }
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
