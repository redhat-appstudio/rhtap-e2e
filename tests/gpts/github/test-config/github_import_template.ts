import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { DeveloperHubClient } from '../../../../src/apis/backstage/developer-hub';
import { TaskIdReponse } from '../../../../src/apis/backstage/types';
import { generateRandomChars } from '../../../../src/utils/generator';
import { GitHubProvider } from "../../../../src/apis/scm-providers/github";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { checkEnvVariablesGitHub, cleanAfterTestGitHub, createImportTaskGitHub, createTaskCreatorOptionsGitHub, getDeveloperHubClient, getGitHubClient, getRHTAPGitopsNamespace, waitForComponentCreation } from "../../../../src/utils/test.utils";

/**
 * 1. Components get created in Red Hat Developer Hub
 * 2. Check that components gets created successfully in Red Hat Developer Hub
 * 3. Red Hat Developer Hub created GitHub repository
 * 4. Remove component/location from RHDH
 * 5. Add component/location to RHDH
 * 6. Check that components gets created successfully in Red Hat Developer Hub
 */
export const gitHubImportTemplateTests = (gptTemplate: string) => {
    describe(`Red Hat Trusted Application Pipeline ${gptTemplate} GPT tests GitHub provider with public/private image registry`, () => {
        jest.retryTimes(3, { logErrorsBeforeRetry: true });

        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || 'rhtap-app';
        const ciNamespace = `${componentRootNamespace}-ci`;

        const githubOrganization = process.env.GITHUB_ORGANIZATION || '';
        const repositoryName = `${generateRandomChars(9)}-${gptTemplate}`;

        const imageName = "rhtap-qe-" + `${gptTemplate}`;
        const ImageOrg = process.env.IMAGE_REGISTRY_ORG || 'rhtap';
        const imageRegistry = process.env.IMAGE_REGISTRY || 'quay.io';

        let developerHubTask: TaskIdReponse;
        let backstageClient: DeveloperHubClient;
        let gitHubClient: GitHubProvider;
        let kubeClient: Kubernetes;

        let RHTAPGitopsNamespace: string;

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

            await checkEnvVariablesGitHub(componentRootNamespace, githubOrganization, ImageOrg, ciNamespace, kubeClient);
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
            const taskCreatorOptions = await createTaskCreatorOptionsGitHub(gptTemplate, imageName, ImageOrg, imageRegistry, githubOrganization, repositoryName, componentRootNamespace, "tekton");

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
        it(`verifies if component ${gptTemplate} was created in GitHub and contains 'catalog-info.yaml' file`, async () => {
            const repositoryExists = await gitHubClient.checkIfRepositoryExists(githubOrganization, repositoryName);
            expect(repositoryExists).toBe(true);

            const catalogFileExists = await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName, 'catalog-info.yaml');
            expect(catalogFileExists).toBe(true);
        }, 120000);

        /**
         * Delete catalog file, tekton folder and gitops folder.
         */
        it(`Delete catalog file and tekton folder.`, async () => {
            await gitHubClient.deleteFolderInRepository(githubOrganization, repositoryName, '.tekton');
            await gitHubClient.deleteFolderInRepository(githubOrganization, repositoryName, 'gitops');
            await gitHubClient.deleteFileInRepository(githubOrganization, repositoryName, 'catalog-info.yaml');
        }, 120000);

        /**
         * Delete entities from backstage
         */
        it(`Delete location from backstage`, async () => {
            const componentIsUnregistered = await backstageClient.deleteEntitiesBySelector(repositoryName);
            expect(componentIsUnregistered).toBe(true);

        }, 120000);

        it(`Create task import-repo for importing component component`, async () => {
            const taskCreatorOptions = await createImportTaskGitHub(repositoryName + "-imported", "https://github.com/" + githubOrganization + "/" + repositoryName, imageName, ImageOrg, imageRegistry, githubOrganization, componentRootNamespace, "tekton");
            // Creating a task in Developer Hub to scaffold the component
            developerHubTask = await backstageClient.createDeveloperHubTask(taskCreatorOptions);
        }, 120000);

        /**
        * Check, if (new) location is added successfully
        */
        it(`Check imported newly location(component in backstage) backstage`, async () => {
            await waitForComponentCreation(backstageClient, repositoryName + "-imported", developerHubTask);
        }, 120000);

        /**
         * Check argo resources for imported template
         */
        it(`wait ${gptTemplate} argocd to be synced in the cluster for imported template`, async () => {
            const argoCDAppISSynced = await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-imported-development`, 500000);
            expect(argoCDAppISSynced).toBe(true);
        }, 600000);

        /**
         * Start to verify if Red Hat Developer Hub created repository from our template in GitHub. This repository should contain the source code of 
         * my application. Also verifies if the repository contains a '.tekton' folder.
         */
        it(`verifies if imported component ${gptTemplate} was created in GitHub and contains 'catalog-info.yaml' file in imported template`, async () => {
            const repositoryExists = await gitHubClient.checkIfRepositoryExists(githubOrganization, repositoryName  + "-imported");
            expect(repositoryExists).toBe(true);

            const catalogFileExists = await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName + "-imported", 'catalog-info.yaml');
            expect(catalogFileExists).toBe(true);
        }, 120000);

        /**
        * Deletes created applications
        */
        afterAll(async () => {
            if (process.env.CLEAN_AFTER_TESTS === 'true') {
                await cleanAfterTestGitHub(gitHubClient, kubeClient, RHTAPGitopsNamespace, githubOrganization, repositoryName);
                await cleanAfterTestGitHub(gitHubClient, kubeClient, RHTAPGitopsNamespace, githubOrganization, repositoryName + "-imported");
            }
        });
    });

};
