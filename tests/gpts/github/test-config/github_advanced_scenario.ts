import { beforeAll, describe, expect, it } from '@jest/globals';
import { DeveloperHubClient } from '../../../../src/apis/backstage/developer-hub'
import { TaskIdReponse } from '../../../../src/apis/backstage/types';
import { generateRandomChars } from '../../../../src/utils/generator';
import { syncArgoApplication } from '../../../../src/utils/argocd';
import { GitHubProvider } from "../../../../src/apis/git-providers/github";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { ScaffolderScaffoldOptions } from '@backstage/plugin-scaffolder-react';
import { cleanAfterTestGitHub } from "../../../../src/utils/test.utils";

/**
 * Advanced end-to-end test scenario for Red Hat Trusted Application Pipelines:
 * 1. Create components in Red Hat Developer Hub.
 * 2. Verify successful creation of components in Red Hat Developer Hub.
 * 3. Ensure Red Hat Developer Hub creates a corresponding GitHub repository.
 * 4. Initiate a Pull Request to trigger a PipelineRun for pull_request events in the GitHub repository.
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
export const githubSoftwareTemplatesAdvancedScenarios = (gptTemplate: string) => {
    describe(`Red Hat Trusted Application Pipeline ${gptTemplate} GPT tests GitHub provider with public/private image registry`, () => {

        const backstageClient =  new DeveloperHubClient();
        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || '';
        const RHTAPRootNamespace = process.env.RHTAP_ROOT_NAMESPACE || 'rhtap';
        const developmentEnvironmentName = 'development';
        const stagingEnvironmentName = 'stage';
        const productionEnvironmentName = 'prod';
        const quayImageName = "rhtap-qe";

        const developmentNamespace = `${componentRootNamespace}-${developmentEnvironmentName}`;
        const stageNamespace = `${componentRootNamespace}-${stagingEnvironmentName}`;
        const prodNamespace = `${componentRootNamespace}-${productionEnvironmentName}`;

        const githubOrganization = process.env.GITHUB_ORGANIZATION || '';
        const repositoryName = `${generateRandomChars(9)}-${gptTemplate}`;

        const quayImageOrg = process.env.QUAY_IMAGE_ORG || '';

        let developerHubTask: TaskIdReponse;
        let gitHubClient: GitHubProvider;
        let kubeClient: Kubernetes;

        let pullRequestNumber: number;
        let gitopsPromotionPRNumber: number;
        let extractedBuildImage: string;

        /**
         * Initializes Github and Kubernetes client for interaction. After clients initialization will start to create a test namespace.
         * This namespace should have gitops label: 'argocd.argoproj.io/managed-by': 'openshift-gitops' to allow ArgoCD to create
         * resources
        */
        beforeAll(async()=> {
            gitHubClient = new GitHubProvider()
            kubeClient = new Kubernetes()

            if (componentRootNamespace === '') {
                throw new Error("The 'APPLICATION_TEST_NAMESPACE' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
            }

            if (githubOrganization === '') {
                throw new Error("The 'GITHUB_ORGANIZATION' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
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
         * Creates a request to Developer Hub and check if the gpt really exists in the catalog
         */
        it(`verifies if ${gptTemplate} gpt exists in the catalog`, async ()=> {
            const goldenPathTemplates = await backstageClient.getGoldenPathTemplates();

            expect(goldenPathTemplates.some(gpt => gpt.metadata.name === gptTemplate)).toBe(true)
        })

        /**
         * Creates a task in Developer Hub to generate a new component using specified git and kube options.
         * 
         * @param {string} templateRef Refers to the Developer Hub template name.
         * @param {object} values Set of options to create the component.
         * @param {string} values.branch Default git branch for the component.
         * @param {string} values.githubServer GitHub server URL.
         * @param {string} values.hostType Type of host (e.g., GitHub).
         * @param {string} values.imageName Registry image name for the component to be pushed.
         * @param {string} values.imageOrg Registry organization name for the component to be pushed.
         * @param {string} values.imageRegistry Image registry provider. Default is Quay.io.
         * @param {string} values.name Name of the repository to be created in GitHub.
         * @param {string} values.namespace Kubernetes namespace where ArgoCD will create component manifests.
         * @param {string} values.owner Developer Hub username who initiates the task.
         * @param {string} values.repoName Name of the GitHub repository.
         * @param {string} values.repoOwner Owner of the GitHub repository.
         */
        it(`creates ${gptTemplate} component`, async () => {            
            const taskCreatorOptions: ScaffolderScaffoldOptions = {
                templateRef: `template:default/${gptTemplate}`,
                values: {
                    branch: 'main',
                    githubServer: 'github.com',
                    hostType: 'GitHub',
                    imageName: quayImageName,
                    imageOrg: quayImageOrg,
                    imageRegistry: 'quay.io',
                    name: repositoryName,
                    namespace: componentRootNamespace,
                    owner: "user:guest",
                    repoName: repositoryName,
                    repoOwner: githubOrganization,
                    ciType: "tekton"
                }
            };

            // Creating a task in Developer Hub to scaffold the component
            developerHubTask = await backstageClient.createDeveloperHubTask(taskCreatorOptions);
        }, 120000);

        /**
         * Waits for the specified component task to be processed by Developer Hub and retrieves logs upon completion.
         */
        it(`wait ${gptTemplate} component to be finished`, async () => {
            // Retrieve the processed task from Developer Hub
            const taskCreated = await backstageClient.getTaskProcessed(developerHubTask.id, 120000);

            if (taskCreated.status !== 'completed') {
                console.log("failed to create backstage tasks. creating logs...")
                try {
                    const logs = await backstageClient.getEventStreamLog(taskCreated.id)
                    await backstageClient.writeLogsToArtifactDir('backstage-tasks-logs', `github-${repositoryName}.log`, logs)
                } catch (error) {
                    throw new Error(`failed to write files to console: ${error}`);
                }
            } else {
                console.log("Task created successfully in backstage");
            }
        }, 600000);

        /**
         * Verifies if Red Hat Developer Hub created a repository from the specified template in GitHub.
         * The repository should contain the source code of the application and a '.tekton' folder.
         */
        it(`verifies if component ${gptTemplate} was created in GitHub and contains '.tekton' folder`, async () => {
            // Check if the repository exists in GitHub
            const repositoryExists = await gitHubClient.checkIfRepositoryExists(githubOrganization, repositoryName);
            expect(repositoryExists).toBe(true);

            // Check if the '.tekton' folder exists in the repository
            const tektonFolderExists = await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName, '.tekton');
            expect(tektonFolderExists).toBe(true);
        }, 120000);

        /**
         * Verifies if Red Hat Developer Hub created the GitOps repository with all the manifests for ArgoCD.
         * The repository should contain the '.tekton' folder.
         * 
         */
        it(`verifies if component ${gptTemplate} have a valid GitOps repository and there exists a '.tekton' folder`, async () => {
            // Check if the GitOps repository exists in GitHub
            const repositoryExists = await gitHubClient.checkIfRepositoryExists(githubOrganization, `${repositoryName}-gitops`);
            expect(repositoryExists).toBe(true);

            // Check if the '.tekton' folder exists in the GitOps repository
            const tektonFolderExists = await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, `${repositoryName}-gitops`, '.tekton');
            expect(tektonFolderExists).toBe(true);
        }, 120000);

        /**
         * Waits for the specified ArgoCD application associated with the DeveloperHub task to be synchronized in the cluster.
         */
        it(`wait ${gptTemplate} argocd to be synced in the cluster`, async () => {
            // Wait for the ArgoCD application to be synchronized in the cluster
            const argoCDAppISSynced = await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000);
            
            // Expect the ArgoCD application to be synced
            expect(argoCDAppISSynced).toBe(true);
        }, 600000);

        /**
         * Creates an empty commit in the repository and expects a PipelineRun to start.
         * This step is used to trigger a PipelineRun by creating a pull request.
         * 
         * @throws {Error} Throws an error if the creation of the pull request fails.
         */
        it(`Creates a pull request to trigger a PipelineRun`, async () => {
            const prNumber = await gitHubClient.createPullRequestFromMainBranch(githubOrganization, repositoryName, 'test_file.txt', 'Test content');

            // Set the pull request number if creation was successful
            if (prNumber !== undefined) {
                pullRequestNumber = prNumber;
            } else {
                throw new Error("Failed to create a pull request");
            }
        }, 120000);

        /**
         * Waits until a pipeline run is created in the cluster and start to wait until succeed/fail.
         */
        it(`Wait component ${gptTemplate} pull request pipelinerun to be triggered and finished`, async ()=> {
            const pipelineRun = await kubeClient.getPipelineRunByRepository(repositoryName, 'pull_request')

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
         * Creates an empty commit in the repository and expect that a pipelinerun start. Bug which affect to completelly finish this step: https://issues.redhat.com/browse/RHTAPBUGS-1136
         */
        it(`Merge pull_request to trigger a push pipelinerun`, async ()=> {
            await gitHubClient.mergePullRequest(githubOrganization, repositoryName, pullRequestNumber)
        }, 120000)

        /**
         * Waits until a pipeline run is created in the cluster and start to wait until succeed/fail.
         */
        it(`Wait component ${gptTemplate} push pipelinerun to be triggered and finished`, async ()=> {
            const pipelineRun = await kubeClient.getPipelineRunByRepository(repositoryName, 'push')
        
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
            await syncArgoApplication(RHTAPRootNamespace, `${repositoryName}-${developmentEnvironmentName}`)

            const componentRoute = await kubeClient.getOpenshiftRoute(repositoryName, developmentNamespace)

            const isReady = await backstageClient.waitUntilComponentEndpointBecomeReady(`https://${componentRoute}/hello-resteasy`, 10 * 60 * 1000)

            if (!isReady) {
                throw new Error("Component seems was not synced by ArgoCD in 10 minutes");
            }

        }, 900000)

        /**
         * Trigger a promotion Pull Request in Gitops repository to promote development image to stage environment
         */
        it('trigger pull request promotion to promote from development to stage environment', async ()=> {
            const getImage = await gitHubClient.extractImageFromContent(githubOrganization, `${repositoryName}-gitops`, repositoryName, developmentEnvironmentName)

            if (getImage !== undefined) {
                extractedBuildImage = getImage
            } else {
                throw new Error("Failed to create a pr");
            }

            const gitopsPromotionPR = await gitHubClient.promoteGitopsImageEnvironment(githubOrganization, `${repositoryName}-gitops`, repositoryName, stagingEnvironmentName, extractedBuildImage)
            if (gitopsPromotionPR !== undefined) {
                gitopsPromotionPRNumber = gitopsPromotionPR
            } else {
                throw new Error("Failed to create a pr");
            }
        })

        /**
         * Verifies successful completion of EC PipelineRun to ensure environment promotion from development to staging.
         */
        it('verifies successful completion of EC PipelineRun to ensure environment promotion from development to staging', async () => {
            const pipelineRun = await kubeClient.getPipelineRunByRepository(`${repositoryName}-gitops`, 'pull_request')

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
            await gitHubClient.mergePullRequest(githubOrganization, `${repositoryName}-gitops`, gitopsPromotionPRNumber)
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
            const getImage = await gitHubClient.extractImageFromContent(githubOrganization, `${repositoryName}-gitops`, repositoryName, stagingEnvironmentName)

            if (getImage !== undefined) {
                extractedBuildImage = getImage
            } else {
                throw new Error("Failed to create a pr");
            }

            const gitopsPromotionPR = await gitHubClient.promoteGitopsImageEnvironment(githubOrganization, `${repositoryName}-gitops`, repositoryName, productionEnvironmentName, extractedBuildImage)
            if (gitopsPromotionPR !== undefined) {
                gitopsPromotionPRNumber = gitopsPromotionPR
            } else {
                throw new Error("Failed to create a pr");
            }
        })

        /**
         * Verifies successful completion of EC PipelineRun to ensure environment promotion from staging to production.
         */
        it('verifies successful completion of PipelineRun to ensure environment promotion from stage to prod', async () => {
            const pipelineRun = await kubeClient.getPipelineRunByRepository(`${repositoryName}-gitops`, 'pull_request')

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
         * If pipelinerun succeeds merge the PR to allow image to sync in prod environment
         */
        it(`merge gitops pull request to sync new image in prod environment`, async ()=> {
            await gitHubClient.mergePullRequest(githubOrganization, `${repositoryName}-gitops`, gitopsPromotionPRNumber)
        }, 120000)

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster
         */
        it('container component is successfully synced by gitops in prod environment', async ()=> {
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
                await cleanAfterTestGitHub(gitHubClient, kubeClient, RHTAPRootNamespace, githubOrganization, repositoryName)
            }
        })
    })
}
