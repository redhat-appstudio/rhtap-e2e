import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { DeveloperHubClient } from '../../../../src/apis/backstage/developer-hub'
import { TaskIdReponse } from '../../../../src/apis/backstage/types';
import { generateRandomChars } from '../../../../src/utils/generator';
import { GitHubProvider } from "../../../../src/apis/git-providers/github";
import { JenkinsCI } from "../../../../src/apis/ci/jenkins";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { ScaffolderScaffoldOptions } from '@backstage/plugin-scaffolder-react';
import { cleanAfterTestGitHub, waitForStringInPageContent } from "../../../../src/utils/test.utils";
import { syncArgoApplication } from '../../../../src/utils/argocd';

/**
 * 1. Components get created in Red Hat Developer Hub
 * 2. Check that components gets created successfully in Red Hat Developer Hub
 * 3. Red Hat Developer Hub created GitHub repositories with Jenkinsfiles
 * 4. Commit Jenkins agent settings and enable ACS
 * 5. Creates job in Jenkins
 * 6. Trigger Jenkins Job and wait for finish 
 * 7. Perform an commit in GitHub
 * 8. Trigger Jenkins Job and wait for finish
 * 9. Check if the application is deployed in development namespace and pod is synched
 */
export const gitHubJenkinsBasicGoldenPathTemplateTests = (gptTemplate: string, stringOnRoute: string) => {
    describe(`Red Hat Trusted Application Pipeline ${gptTemplate} GPT tests GitHub provider with public/private image registry`, () => {
        jest.retryTimes(2);

        const backstageClient = new DeveloperHubClient();
        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || '';
        const RHTAPRootNamespace = process.env.RHTAP_ROOT_NAMESPACE || 'rhtap';
        const developmentNamespace = `${componentRootNamespace}-development`;
        const developmentEnvironmentName = 'development';

        const githubOrganization = process.env.GITHUB_ORGANIZATION || '';
        const repositoryName = `${generateRandomChars(9)}-${gptTemplate}`;

        const jenkinsClient = new JenkinsCI();

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
        beforeAll(async () => {
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
        it(`verifies if ${gptTemplate} gpt exists in the catalog`, async () => {
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
                    name: repositoryName,
                    owner: "user:guest",
                    hostType: 'GitHub',
                    repoOwner: githubOrganization,
                    repoName: repositoryName,
                    branch: 'main',
                    githubServer: 'github.com',
                    ciType: 'jenkins',
                    imageRegistry: 'quay.io',
                    imageOrg: quayImageOrg,
                    imageName: quayImageName,
                    namespace: componentRootNamespace,
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
                console.log("Task named " + repositoryName + " created successfully in backstage");
            }
        }, 120000);

        /**
         * Once a DeveloperHub task is processed should create an argocd application in openshift-gitops namespace. 
         * Need to wait until application is synced until commit something to github and trigger a pipelinerun
         */
        it(`wait ${gptTemplate} argocd to be synced in the cluster`, async () => {
            expect(await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000)).toBe(true)
        }, 600000);

        /**
         * Start to verify if Red Hat Developer Hub created repository from our template in GitHub. This repository should contain the source code of 
         * my application. Also verifies if the repository contains a Jenkinsfile.
         */
        it(`verifies if component ${gptTemplate} was created in GitHub and contains Jenkinsfile`, async () => {
            const repositoryExists = await gitHubClient.checkIfRepositoryExists(githubOrganization, repositoryName)
            expect(repositoryExists).toBe(true)

            const tektonFolderExists = await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName, 'Jenkinsfile')
            expect(tektonFolderExists).toBe(true)
        }, 120000)

        /**
         * Creates commits to update Jenkins agent and enable ACS scan
         */
        it(`Commit updated agent ${gptTemplate} and enable ACS scan`, async () => {
            expect(await gitHubClient.createAgentCommit(githubOrganization, repositoryName)).not.toBe(undefined)
            expect(await gitHubClient.enableACSJenkins(githubOrganization, repositoryName)).not.toBe(undefined)
        }, 120000)

        /**
         * Verification to check if Red Hat Developer Hub created the gitops repository with Jenkinsfile
         */
        it(`verifies if component ${gptTemplate} have a valid gitops repository and there exists a Jenkinsfile`, async () => {
            expect(await gitHubClient.checkIfRepositoryExists(githubOrganization, `${repositoryName}-gitops`)).toBe(true)
            expect(await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName, 'Jenkinsfile')).toBe(true)
        }, 120000)

        it(`creates ${gptTemplate} jenkins job and wait for creation`, async () => {
            await jenkinsClient.createJenkinsJob("github.com", githubOrganization, repositoryName);
            await jenkinsClient.waitForJobCreation(repositoryName);
        }, 120000);

        /**
         * Trigger and wait for Jenkins job to finish
         */
        it(`Trigger and wait for ${gptTemplate} jenkins job`, async () => {
            const queueItemUrl = await jenkinsClient.buildJenkinsJob(repositoryName);
            console.log('Waiting for the build to start...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            await jenkinsClient.waitForBuildToFinish(repositoryName, 1);
        }, 240000);

        /**
         * Creates an empty commit
         */
        it(`Creates empty commit`, async () => {
            const commit = await gitHubClient.createEmptyCommit(githubOrganization, repositoryName)
            expect(commit).not.toBe(undefined)

        }, 120000)

        /**
         * Trigger and wait for Jenkins job to finish(it will also run deplyment pipeline)
         */
        it(`Trigger job and wait for ${gptTemplate} jenkins job to finish`, async () => {
            const queueItemUrl = await jenkinsClient.buildJenkinsJob(repositoryName);

            console.log('Waiting for the build to start...');

            await new Promise(resolve => setTimeout(resolve, 5000));
            await jenkinsClient.waitForBuildToFinish(repositoryName, 2);
        }, 240000);

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in development environment
         */
        it('container component is successfully synced by gitops in development environment', async () => {
            console.log("syncing argocd application in development environment")
            await syncArgoApplication(RHTAPRootNamespace, `${repositoryName}-${developmentEnvironmentName}`)

            const componentRoute = await kubeClient.getOpenshiftRoute(repositoryName, developmentNamespace)

            const isReady = await backstageClient.waitUntilComponentEndpointBecomeReady(`https://${componentRoute}`, 10 * 60 * 1000)

            if (!isReady) {
                throw new Error("Component seems was not synced by ArgoCD in 10 minutes");
            }

            expect(await waitForStringInPageContent(`https://${componentRoute}`, stringOnRoute, 120000)).toBe(true)
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
