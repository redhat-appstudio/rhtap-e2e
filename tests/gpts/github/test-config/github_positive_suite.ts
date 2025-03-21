import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { DeveloperHubClient } from '../../../../src/apis/backstage/developer-hub';
import { TaskIdReponse } from '../../../../src/apis/backstage/types';
import { generateRandomChars } from '../../../../src/utils/generator';
import { GitHubProvider } from "../../../../src/apis/scm-providers/github";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { checkEnvVariablesGitHub, cleanAfterTestGitHub, createTaskCreatorOptionsGitHub, getDeveloperHubClient, getGitHubClient, checkIfAcsScanIsPass, verifySyftImagePath, getRHTAPGitopsNamespace, waitForComponentCreation } from "../../../../src/utils/test.utils";
import { Tekton } from '../../../../src/utils/tekton';
import { onPushTasks } from '../../../../src/constants/tekton';


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
        jest.retryTimes(3, {logErrorsBeforeRetry: true}); 

        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || 'rhtap-app';
        const ciNamespace = `${componentRootNamespace}-ci`;

        const githubOrganization = process.env.GITHUB_ORGANIZATION || '';
        const repositoryName = `${generateRandomChars(9)}-${gptTemplate}`;

        const imageName = "rhtap-qe-" + `${gptTemplate}`;
        const imageOrg = process.env.IMAGE_REGISTRY_ORG || 'rhtap';
        const imageRegistry = process.env.IMAGE_REGISTRY || 'quay.io';

        let developerHubTask: TaskIdReponse;
        let backstageClient: DeveloperHubClient;
        let gitHubClient: GitHubProvider;
        let kubeClient: Kubernetes;
        let tektonClient: Tekton;

        let RHTAPGitopsNamespace: string;

        /**
         * Initializes Github and Kubernetes client for interaction. After clients initialization will start to create a test namespace.
         * This namespace should have gitops label: 'argocd.argoproj.io/managed-by': 'openshift-gitops' to allow ArgoCD to create
         * resources
        */
        beforeAll(async () => {
            RHTAPGitopsNamespace = await getRHTAPGitopsNamespace();
            kubeClient = new Kubernetes();
            tektonClient = new Tekton();
            gitHubClient = await getGitHubClient(kubeClient);
            backstageClient = await getDeveloperHubClient(kubeClient);

            await checkEnvVariablesGitHub(componentRootNamespace, githubOrganization, imageOrg, ciNamespace, kubeClient);
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
            const taskCreatorOptions = await createTaskCreatorOptionsGitHub(gptTemplate, imageName, imageOrg, imageRegistry, githubOrganization, repositoryName, componentRootNamespace, "tekton");

            // Creating a task in Developer Hub to scaffold the component
            developerHubTask = await backstageClient.createDeveloperHubTask(taskCreatorOptions);
        }, 120000);

        /**
         * Once test send a task to Developer Hub, test start to look for the task until all the steps are processed. Once all the steps are processed
         * test will grab logs in $ROOT_DIR/artifacts/backstage/xxxxx-component-name.log
         */
        it(`wait ${gptTemplate} component to be finished`, async () => {
            await waitForComponentCreation(backstageClient, repositoryName, developerHubTask);
        }, 120000);

        /**
         * Once a DeveloperHub task is processed should create an argocd application in openshift-gitops namespace. 
         * Need to wait until application is synced until commit something to github and trigger a pipelinerun
         */
        it(`wait ${gptTemplate} argocd to be synced in the cluster`, async () => {
            const argoCDAppISSynced = await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000);
            expect(argoCDAppISSynced).toBe(true);
        }, 600000);

        /**
         * Start to verify if Red Hat Developer Hub created repository from our template in GitHub. This repository should contain the source code of 
         * my application. Also verifies if the repository contains a '.tekton' folder.
         */
        it(`verifies if component ${gptTemplate} was created in GitHub and contains '.tekton' folder`, async () => {
            const repositoryExists = await gitHubClient.checkIfRepositoryExists(githubOrganization, repositoryName);
            expect(repositoryExists).toBe(true);

            const tektonFolderExists = await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName, '.tekton');
            expect(tektonFolderExists).toBe(true);
        }, 120000);

        /**
         * Verification to check if Red Hat Developer Hub created the gitops repository with all our manifests for argoCd
         */
        it(`verifies if component ${gptTemplate} have a valid gitops repository and there exists a '.tekton' folder`, async () => {
            const repositoryExists = await gitHubClient.checkIfRepositoryExists(githubOrganization, `${repositoryName}-gitops`);
            expect(repositoryExists).toBe(true);

            const tektonFolderExists = await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName, '.tekton');
            expect(tektonFolderExists).toBe(true);
        }, 120000);

        /**
         * Creates an empty commit in the repository and expect that a pipelinerun start. Bug which affect to completelly finish this step: https://issues.redhat.com/browse/RHTAPBUGS-1136
         */
        it(`Creates empty commit to trigger a pipeline run`, async () => {
            const commit = await gitHubClient.createEmptyCommit(githubOrganization, repositoryName);
            expect(commit).not.toBe(undefined);

        }, 120000);

        /**
         * Waits until a pipeline run is created in the cluster and start to wait until succeed/fail.
         */
        it(`Wait component ${gptTemplate} pipelinerun to be triggered and finished`, async () => {
            const pipelineRunResult = await tektonClient.verifyPipelineRunByRepository(repositoryName, ciNamespace, 'push', onPushTasks);
            expect(pipelineRunResult).toBe(true);
        }, 900000);

        /**
         * Check if the pipelinerun yaml has the rh-syft image path mentioned
         * if failed to figure out the image path ,return pod yaml for reference
         */
        it(`Check ${gptTemplate} pipelinerun yaml has the rh-syft image path`, async () => {
            const result = await verifySyftImagePath(kubeClient, repositoryName, ciNamespace, 'push');
            expect(result).toBe(true);
        }, 900000);

        /**
         * verify if the ACS Scan is successfully done from the logs of task steps
         */
        it(`Check if ACS Scan is successful for ${gptTemplate}`, async () => {
            const result = await checkIfAcsScanIsPass(kubeClient, repositoryName, ciNamespace, 'push');
            expect(result).toBe(true);
            console.log("Verified as ACS Scan is Successful");
        }, 900000);


        /**
        * Deletes created applications
        */
        afterAll(async () => {
            if (process.env.CLEAN_AFTER_TESTS === 'true') {
                await cleanAfterTestGitHub(gitHubClient, kubeClient, RHTAPGitopsNamespace, githubOrganization, repositoryName);
            }
        });
    });

};
