import { DeveloperHubClient } from '../../../../src/apis/backstage/developer-hub';
import { TaskIdReponse } from '../../../../src/apis/backstage/types';
import { generateRandomChars } from '../../../../src/utils/generator';
import { GitHubProvider } from "../../../../src/apis/git-providers/github";
import { JenkinsCI } from "../../../../src/apis/ci/jenkins";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { checkComponentSyncedInArgoAndRouteIsWorking, checkEnvVariablesGitHub, cleanAfterTestGitHub, createTaskCreatorOptionsGitHub, getDeveloperHubClient, getGitHubClient, getJenkinsCI, getRHTAPRootNamespace } from "../../../../src/utils/test.utils";
import { Utils } from '../../../../src/apis/git-providers/utils';

/**
 * 1. Components get created in Red Hat Developer Hub
 * 2. Check that components gets created successfully in Red Hat Developer Hub
 * 3. Check if Red Hat Developer Hub created GitHub repositories with Jenkinsfiles
 * 4. Commit Jenkins agent settings and enable ACS
 * 5. Creates job in Jenkins
 * 6. Trigger Jenkins Job and wait for finish 
 * 7. Perform an commit in GitHub
 * 8. Trigger Jenkins Job and wait for finish
 * 9. Check if the application is deployed in development namespace and pod is synched
 */
export const gitHubJenkinsBasicGoldenPathTemplateTests = (gptTemplate: string, stringOnRoute: string) => {
    describe(`Red Hat Trusted Application Pipeline ${gptTemplate} GPT tests GitHub provider with public/private image registry`, () => {

        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || 'rhtap-app';
        const developmentNamespace = `${componentRootNamespace}-development`;
        const developmentEnvironmentName = 'development';

        const githubOrganization = process.env.GITHUB_ORGANIZATION || '';
        const repositoryName = `${generateRandomChars(9)}-${gptTemplate}`;

        const quayImageName = "rhtap-qe";
        const quayImageOrg = process.env.QUAY_IMAGE_ORG || '';
        const imageRegistry = process.env.IMAGE_REGISTRY || 'quay.io';

        let RHTAPRootNamespace: string;

        let developerHubTask: TaskIdReponse;
        let backstageClient: DeveloperHubClient;
        let gitHubClient: GitHubProvider;
        let kubeClient: Kubernetes;
        let jenkinsClient: JenkinsCI;

        /**
         * Initializes Github and Kubernetes client for interaction. After clients initialization will start to create a test namespace.
         * This namespace should have gitops label: 'argocd.argoproj.io/managed-by': 'openshift-gitops' to allow ArgoCD to create
         * resources
        */
        beforeAll(async () => {
            RHTAPRootNamespace = await getRHTAPRootNamespace();
            kubeClient = new Kubernetes();
            gitHubClient = await getGitHubClient(kubeClient);
            backstageClient = await getDeveloperHubClient(kubeClient);
            jenkinsClient = await getJenkinsCI(kubeClient);

            await checkEnvVariablesGitHub(componentRootNamespace, githubOrganization, quayImageOrg, developmentNamespace, kubeClient);
        });

        /**
         * Creates a request to Developer Hub and check if the gpt really exists in the catalog
         */
        it(`verifies if ${gptTemplate} gpt exists in the catalog`, async () => {
            const goldenPathTemplates = await backstageClient.getGoldenPathTemplates();
            expect(goldenPathTemplates.some(gpt => gpt.metadata.name === gptTemplate)).toBe(true);
        });

        /**
         * Creates a task in Developer Hub to generate a new component using specified git and kube options.
         * 
         */
        it(`creates ${gptTemplate} component`, async () => {
            const taskCreatorOptions = await createTaskCreatorOptionsGitHub(gptTemplate, quayImageName, quayImageOrg, imageRegistry, githubOrganization, repositoryName, componentRootNamespace, "jenkins");

            // Creating a task in Developer Hub to scaffold the component
            developerHubTask = await backstageClient.createDeveloperHubTask(taskCreatorOptions);
        }, 120000);

        /**
         * Once test send a task to Developer Hub, test start to look for the task until all the steps are processed. Once all the steps are processed
         * test will grab logs in $ROOT_DIR/artifacts/backstage/xxxxx-component-name.log
         */
        it(`wait ${gptTemplate} component to be finished`, async () => {
            const taskCreated = await backstageClient.getTaskProcessed(developerHubTask.id, 120000);

            if (taskCreated.status !== 'completed') {

                try {
                    const logs = await backstageClient.getEventStreamLog(taskCreated.id);
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
            expect(await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000)).toBe(true);
        }, 600000);

        /**
         * Start to verify if Red Hat Developer Hub created repository from our template in GitHub. This repository should contain the source code of 
         * my application. Also verifies if the repository contains a Jenkinsfile.
         */
        it(`verifies if component ${gptTemplate} was created in GitHub and contains Jenkinsfile`, async () => {
            expect(await gitHubClient.checkIfRepositoryExists(githubOrganization, repositoryName)).toBe(true);
            expect(await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName, 'Jenkinsfile')).toBe(true);
        }, 120000);

        /**
         * Creates commits to update Jenkins agent and enable ACS scan
         */
        it(`Commit updated agent ${gptTemplate} and enable ACS scan`, async () => {
            expect(await gitHubClient.createAgentCommit(githubOrganization, repositoryName)).not.toBe(undefined);
            expect(await gitHubClient.enableACSJenkins(githubOrganization, repositoryName)).not.toBe(undefined);
            expect(await gitHubClient.updateRekorHost(githubOrganization, repositoryName, await kubeClient.getRekorServerUrl(RHTAPRootNamespace))).not.toBe(undefined);
            expect(await gitHubClient.updateTUFMirror(githubOrganization, repositoryName, await kubeClient.getTUFUrl(RHTAPRootNamespace))).not.toBe(undefined);
        }, 120000);

        /**
         * Verification to check if Red Hat Developer Hub created the gitops repository with Jenkinsfile
         */
        it(`verifies if component ${gptTemplate} have a valid gitops repository and there exists a Jenkinsfile`, async () => {
            expect(await gitHubClient.checkIfRepositoryExists(githubOrganization, `${repositoryName}-gitops`)).toBe(true);
            expect(await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName, 'Jenkinsfile')).toBe(true);
        }, 120000);

        it(`creates ${gptTemplate} jenkins job and wait for creation`, async () => {
            await jenkinsClient.createJenkinsJob("github.com", githubOrganization, repositoryName);
            await jenkinsClient.waitForJobCreation(repositoryName);
            await gitHubClient.createWebhook(githubOrganization, repositoryName, await kubeClient.getDeveloperHubSecret(await getRHTAPRootNamespace(), "developer-hub-rhtap-env", "JENKINS__BASEURL") + "/github-webhook/");
        }, 120000);

        /**
         * Trigger and wait for Jenkins job to finish
         * First run must be triggered manually:
         * https://stackoverflow.com/questions/56714213/jenkins-not-triggered-by-github-webhook#comment109322558_60625199 
         */
        it(`Trigger and wait for ${gptTemplate} jenkins job`, async () => {
            await jenkinsClient.buildJenkinsJob(repositoryName);
            console.log('Waiting for the build to start...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            const jobStatus = await jenkinsClient.waitForBuildToFinish(repositoryName, 1, 540000);
            expect(jobStatus).not.toBe(undefined);
            expect(jobStatus).toBe("SUCCESS");
        }, 600000);

        /**
         * Creates an empty commit
         */
        it(`Creates empty commit`, async () => {
            const commit = await gitHubClient.createEmptyCommit(githubOrganization, repositoryName);
            expect(commit).not.toBe(undefined);

        }, 120000);

        /**
         * Trigger and wait for Jenkins job to finish(it will also run deplyment pipeline)
         */
        it(`Trigger job and wait for ${gptTemplate} jenkins job to finish`, async () => {
            new Utils().sleep(5000);
            await new Promise(resolve => setTimeout(resolve, 5000));
            const jobStatus = await jenkinsClient.waitForBuildToFinish(repositoryName, 2, 540000);
            expect(jobStatus).not.toBe(undefined);
            expect(jobStatus).toBe("SUCCESS");
        }, 600000);

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in development environment
         */
        it('container component is successfully synced by gitops in development environment', async () => {
            await checkComponentSyncedInArgoAndRouteIsWorking(kubeClient, backstageClient, developmentNamespace, developmentEnvironmentName, repositoryName, stringOnRoute);
        }, 900000);


        /**
        * Deletes created applications
        */
        afterAll(async () => {
            if (process.env.CLEAN_AFTER_TESTS === 'true') {
                await cleanAfterTestGitHub(gitHubClient, kubeClient, RHTAPRootNamespace, githubOrganization, repositoryName);
                await jenkinsClient.deleteJenkinsJob(repositoryName);
            }
        });
    });

};
