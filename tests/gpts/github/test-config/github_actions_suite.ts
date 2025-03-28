import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { DeveloperHubClient } from '../../../../src/apis/backstage/developer-hub';
import { TaskIdReponse } from '../../../../src/apis/backstage/types';
import { generateRandomChars } from '../../../../src/utils/generator';
import { GitHubProvider } from "../../../../src/apis/scm-providers/github";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import {
    checkComponentSyncedInArgoAndRouteIsWorking,
    checkEnvVariablesGitHub,
    cleanAfterTestGitHub,
    createTaskCreatorOptionsGitHub,
    getDeveloperHubClient,
    getGitHubClient,
    getRHTAPGitopsNamespace,
    setGitHubActionSecrets,
    setGitHubActionVariables,
    waitForComponentCreation
} from "../../../../src/utils/test.utils";

/**
 * 1. Components get created in Red Hat Developer Hub
 * 2. Check that components gets created successfully in Red Hat Developer Hub
 * 3. Check if Red Hat Developer Hub created GitHub repositories with workflow files
 * 4. Creates secrets for GitHub Actions Workflow.
 * 5. Wait for GitHub Actions Job to finish
 * 6. Check if the application is deployed in development namespace and pod is synced
 */

export const gitHubActionsBasicGoldenPathTemplateTests = (gptTemplate: string, stringOnRoute: string) => {
    describe(`Red Hat Trusted Application Pipeline ${gptTemplate} GPT tests GitHub provider with public/private image registry`, () => {
        jest.retryTimes(3, {logErrorsBeforeRetry: true}); 

        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || 'rhtap-app';
        const ciNamespace = `${componentRootNamespace}-ci`;
        const developmentEnvironmentName = 'development';
        const developmentNamespace = `${componentRootNamespace}-${developmentEnvironmentName}`;

        const githubOrganization = process.env.GITHUB_ORGANIZATION || '';
        const repositoryName = `${generateRandomChars(9)}-${gptTemplate}`;

        const imageName = "rhtap-qe-"+ `${gptTemplate}`;
        const imageOrg = process.env.IMAGE_REGISTRY_ORG || 'rhtap';
        const imageRegistry = process.env.IMAGE_REGISTRY || 'quay.io';

        let RHTAPGitopsNamespace: string;

        let developerHubTask: TaskIdReponse;
        let backstageClient: DeveloperHubClient;
        let gitHubClient: GitHubProvider;
        let kubeClient: Kubernetes;

        /**
         * Initializes Github and Kubernetes client for interaction. After clients initialization will start to create a test namespace.
         * This namespace should have gitops label: 'argocd.argoproj.io/managed-by': 'openshift-gitops' to allow ArgoCD to create
         * resources
        */
        beforeAll(async () => {
            RHTAPGitopsNamespace = await getRHTAPGitopsNamespace();
            kubeClient = new Kubernetes();
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
         */
        it(`creates ${gptTemplate} component`, async () => {
            const taskCreatorOptions = await createTaskCreatorOptionsGitHub(gptTemplate, imageName, imageOrg, imageRegistry, githubOrganization, repositoryName, componentRootNamespace, "githubactions");

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
            expect(await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000)).toBe(true);
        }, 600000);

        /**
         * Start to verify if Red Hat Developer Hub created repository from our template in GitHub. This repository should contain the source code of
         * my application. Also verifies if the repository contains a workflow file.
         */
        it(`verifies if component ${gptTemplate} was created in GitHub and contains a workflow file`, async () => {
            expect(await gitHubClient.checkIfRepositoryExists(githubOrganization, repositoryName)).toBe(true);
            expect(await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName, '.github/workflows/build-and-update-gitops.yml')).toBe(true);
        }, 120000);

        /**
         * Verification to check if Red Hat Developer Hub created the gitops repository with workflow file
         */
        it(`verifies if component ${gptTemplate} have a valid gitops repository and there exists a workflow file`, async () => {
            expect(await gitHubClient.checkIfRepositoryExists(githubOrganization, `${repositoryName}-gitops`)).toBe(true);
            expect(await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, `${repositoryName}-gitops`, '.github/workflows/gitops-promotion.yml')).toBe(true);
        }, 120000);

        /**
         * Creates secrets for GitHub Actions Workflow
         */
        it (`creates env variables in repo`, async () => {
            await setGitHubActionSecrets(gitHubClient, kubeClient, githubOrganization, repositoryName);
            await setGitHubActionVariables(gitHubClient, kubeClient, githubOrganization, repositoryName, imageRegistry);
            expect(await gitHubClient.updateWorkflowFileToEnableSecrets(githubOrganization, repositoryName, '.github/workflows/build-and-update-gitops.yml')).not.toBe(undefined);
        }, 600000);

        /**
         * Trigger and wait for Actions job to finish
         */
        it(`Trigger and wait for ${gptTemplate} GitHub Actions job`, async () => {
            expect(await gitHubClient.getLatestWorkflowRunStatus(githubOrganization, repositoryName, "TSSC-Build-Attest-Scan-Deploy")).toBe("success");
        }, 300000);

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in development environment
         */
        it('Container component is successfully synced by gitops in development environment', async () => {
            console.log("syncing argocd application in development environment");
            await checkComponentSyncedInArgoAndRouteIsWorking(kubeClient, backstageClient, developmentNamespace, developmentEnvironmentName, repositoryName, stringOnRoute);
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
