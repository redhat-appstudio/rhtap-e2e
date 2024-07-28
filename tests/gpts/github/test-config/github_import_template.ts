import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { DeveloperHubClient } from '../../../../src/apis/backstage/developer-hub'
import { TaskIdReponse } from '../../../../src/apis/backstage/types';
import { generateRandomChars } from '../../../../src/utils/generator';
import { GitHubProvider } from "../../../../src/apis/git-providers/github";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { ScaffolderScaffoldOptions } from '@backstage/plugin-scaffolder-react';
import { beforeChecks, checkComponentInBackstage, cleanAfterTestGitHub } from "../../../../src/utils/test.utils";

/**
 * 1. Components get created in Red Hat Developer Hub
 * 2. Check that components gets created successfully in Red Hat Developer Hub
 * 3. Red Hat Developer Hub created GitHub repository
 * 4. Remove component/location from RHDH
 * 5. Add component/location to RHDH
 * 6. Check that components gets created successfully in Red Hat Developer Hub
 */
export const gitHubBasicGoldenPathTemplateTests = (gptTemplate: string) => {
    describe(`Red Hat Trusted Application Pipeline ${gptTemplate} GPT tests GitHub provider with public/private image registry`, () => {
        jest.retryTimes(2);

        const backstageClient = new DeveloperHubClient();
        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || '';
        const RHTAPRootNamespace = process.env.RHTAP_ROOT_NAMESPACE || 'rhtap';
        const developmentNamespace = `${componentRootNamespace}-development`;

        const githubOrganization = process.env.GITHUB_ORGANIZATION || '';
        const repositoryName = `${generateRandomChars(9)}-${gptTemplate}`;

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

            await beforeChecks(componentRootNamespace, githubOrganization, quayImageOrg, developmentNamespace, kubeClient)
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
            await checkComponentInBackstage(backstageClient, repositoryName, developerHubTask)
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
        it(`verifies if component ${gptTemplate} was created in GitHub and contains 'catalog-info.yaml' file`, async () => {
            const repositoryExists = await gitHubClient.checkIfRepositoryExists(githubOrganization, repositoryName)
            expect(repositoryExists).toBe(true)

            const tektonFolderExists = await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName, 'catalog-info.yaml')
            expect(tektonFolderExists).toBe(true)
        }, 120000)

        /**
         * Delete location from backstage
         */
        it(`Delete location from backstage`, async () => {
            // Unregister component from developer hub
            const componentIsUnregistered = await backstageClient.unregisterComponentByName(repositoryName);
            expect(componentIsUnregistered).toBe(true)
        }, 120000)

        /**
         * Register existing location in backstage
         */
        it(`Register location in backstage`, async () => {
            // Register repo in developer hub
            const componentIsRegistered = await backstageClient.registerLocation(repositoryName);
            expect(componentIsRegistered).toBe(true)
        }, 120000)

        /**
        * Check, if (new) location is added successfully
        */
        it(`Check imported location(component in backstage) backstage`, async () => {
            await checkComponentInBackstage(backstageClient, repositoryName, developerHubTask)
        }, 120000)

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
