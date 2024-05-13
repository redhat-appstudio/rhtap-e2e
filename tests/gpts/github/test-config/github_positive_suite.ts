import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { DeveloperHubClient } from '../../../../src/apis/backstage/developer-hub'
import { TaskIdReponse } from '../../../../src/apis/backstage/types';
import { generateRandomName } from '../../../../src/utils/generator';
import { GitHubProvider } from "../../../../src/apis/git-providers/github";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { ScaffolderScaffoldOptions } from '@backstage/plugin-scaffolder-react';
import { cleanAfterTestGitHub } from "../../../../src/utils/test.utils";

/**
 * 1. Components get created in Red Hat Developer Hub
 * 2. Check that components gets created successfully in Red Hat Developer Hub
 * 3. Red Hat Developer Hub created GitHub repository
 * 4. Perform an commit in GitHub to trigger a push PipelineRun
 * 5. Wait For PipelineRun to start and finish successfully. This is not done yet. We need SprayProxy in place and
 * wait for RHTAP bug to be solved: https://issues.redhat.com/browse/RHTAPBUGS-1136
 */
export const gitHubBasicGoldenPathTemplateTests = (gptTemplate: string) => {
    describe(`Red Hat Trusted Application Pipeline ${gptTemplate} GPT tests GitHub provider with public/private image registry`, () => {
        jest.retryTimes(2);

        const backstageClient =  new DeveloperHubClient();
        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || '';
        const RHTAPRootNamespace = process.env.RHTAP_ROOT_NAMESPACE || 'rhtap';
        const developmentNamespace = `${componentRootNamespace}-development`;

        const githubOrganization = process.env.GITHUB_ORGANIZATION || '';
        const repositoryName = `${generateRandomName()}-${gptTemplate}`;

        const quayImageName = "rhtap-qe";
        const quayImageOrg = process.env.QUAY_IMAGE_ORG || '';

        let developerHubTask: TaskIdReponse;
        let gitHubClient: GitHubProvider;
        let kubeClient: Kubernetes;

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
         * @param templateRef Refers to the Developer Hub template name.
         * @param values Set of options to create the component.
         * @param owner Developer Hub username who initiates the task.
         * @param name Name of the repository to be created in GitHub.
         * @param branch Default git branch for the component.
         * @param repoUrl Complete URL of the git provider where the component will be created.
         * @param imageRegistry Image registry provider. Default is Quay.io.
         * @param namespace Kubernetes namespace where ArgoCD will create component manifests.
         * @param imageName Registry image name for the component to be pushed.
         * @param imageOrg Registry organization name for the component to be pushed.
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
                    repoOwner: githubOrganization
                }
            };

            // Creating a task in Developer Hub to scaffold the component
            developerHubTask = await backstageClient.createDeveloperHubTask(taskCreatorOptions);
        }, 120000);

        /**
         * Once test send a task to Developer Hub, test start to look for the task until all the steps are processed. Once all the steps are processed
         * test will grab logs in $ROOT_DIR/artifacts/backstage/xxxxx-component-name.log
         */
        it(`wait ${gptTemplate} component to be finished`, async () => {
            const taskCreated = await backstageClient.getTaskProcessed(developerHubTask.id, 120000)

            if (taskCreated.status !== 'completed') {

                try {
                    const logs = await backstageClient.getEventStreamLog(taskCreated.id)
                    await backstageClient.writeLogsToArtifactDir('backstage-tasks-logs', `github-${repositoryName}.log`, logs);

                    throw new Error("failed to create backstage tasks. Please check Developer Hub tasks logs...");
                    
                } catch (error) {
                    throw new Error(`failed to write files to console: ${error}`);
                }
            } else {
                console.log("Task created successfully in backstage");
            }
        }, 120000);

        /**
         * Once a DeveloperHub task is processed should create an argocd application in openshift-gitops namespace. 
         * Need to wait until application is synced until commit something to github and trigger a pipelinerun
         */
        it(`wait ${gptTemplate} argocd to be synced in the cluster`, async () => {
            const argoCDAppISSynced = await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000)
            expect(argoCDAppISSynced).toBe(true)
        }, 600000);

        /**
         * Start to verify if Red Hat Developer Hub created repository from our template in GitHub. This repository should contain the source code of 
         * my application. Also verifies if the repository contains a '.tekton' folder.
         */
        it(`verifies if component ${gptTemplate} was created in GitHub and contains '.tekton' folder`, async () => {
            const repositoryExists = await gitHubClient.checkIfRepositoryExists(githubOrganization, repositoryName)
            expect(repositoryExists).toBe(true)

            const tektonFolderExists = await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName, '.tekton')
            expect(tektonFolderExists).toBe(true)
        }, 120000)

        /**
         * Verification to check if Red Hat Developer Hub created the gitops repository with all our manifests for argoCd
         */
        it(`verifies if component ${gptTemplate} have a valid gitops repository and there exists a '.tekton' folder`, async () => {
            const repositoryExists = await gitHubClient.checkIfRepositoryExists(githubOrganization, `${repositoryName}-gitops`)
            expect(repositoryExists).toBe(true)

            const tektonFolderExists = await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName, '.tekton')
            expect(tektonFolderExists).toBe(true)
        }, 120000)

        /**
         * Creates an empty commit in the repository and expect that a pipelinerun start. Bug which affect to completelly finish this step: https://issues.redhat.com/browse/RHTAPBUGS-1136
         */
        it(`Creates empty commit to trigger a pipeline run`, async ()=> {
            const commit = await gitHubClient.createEmptyCommit(githubOrganization, repositoryName)
            expect(commit).not.toBe(undefined)

        }, 120000)

        /**
         * Waits until a pipeline run is created in the cluster and start to wait until succeed/fail.
         */
        it(`Wait component ${gptTemplate} pipelinerun to be triggered and finished`, async ()=> {
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
        * Deletes created applications
        */
        afterAll(async () => {
            if (process.env.CLEAN_AFTER_TESTS === 'true') {
                await cleanAfterTestGitHub(gitHubClient, kubeClient, RHTAPRootNamespace, githubOrganization, repositoryName)
            }
        })
    })

}
