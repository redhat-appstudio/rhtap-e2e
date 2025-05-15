import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { DeveloperHubClient } from '../../../../src/apis/backstage/developer-hub';
import { TaskIdReponse } from '../../../../src/apis/backstage/types';
import { generateRandomChars } from '../../../../src/utils/generator';
import { GitHubProvider } from "../../../../src/apis/scm-providers/github";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import {
    checkComponentSyncedInArgoAndRouteIsWorking,
    checkEnvVariablesGitHub,
    checkSBOMInTrustification,
    cleanAfterTestGitHub,
    createTaskCreatorOptionsGitHub,
    getDeveloperHubClient,
    getGitHubClient,
    getRHTAPGitopsNamespace,
    setGitHubActionSecrets,
    parseSbomVersionFromLogs,
    waitForComponentCreation,
    setGitHubActionVariables
} from "../../../../src/utils/test.utils";

/**
 * Advanced end-to-end test scenario for Red Hat Trusted Application Pipelines:
 * 1. Create components in Red Hat Developer Hub.
 * 2. Verify successful creation of components in Red Hat Developer Hub.
 * 3. Ensure Red Hat Developer Hub creates a corresponding GitHub repository.
 * 4. Creates secrets for GitHub Actions Workflow.
 * 5. Wait for GitHub Actions Job to finish
 * 6. Check if the application is deployed in development namespace and pod is synced
 * 7. Verify that the new image is deployed correctly in the development environment.
 * 8. Trigger a Pull Request in the component gitops folder to promote the development image to the stage environment.
 * 9. Verify that the Promotion Actions Workflows are successfully passed.
 * 10. Merge the Pull Request to main.
 * 11. Wait for the new image to be deployed to the stage environment.
 * 12. Trigger a Pull Request in the component gitops repository to promote the stage image to the production environment.
 * 13. Verify that the Promotion Actions Workflows are successfully passed.
 * 14. Merge the Pull Request to main.
 * 15. Wait for the new image to be deployed to the production environment.
 */
export const githubActionsSoftwareTemplatesAdvancedScenarios = (gptTemplate: string, stringOnRoute: string) => {
    describe(`Red Hat Trusted Application Pipeline ${gptTemplate} GPT tests GitHub provider with public/private image registry`, () => {
        jest.retryTimes(3, {logErrorsBeforeRetry: true});

        let developerHubTask: TaskIdReponse;
        let backstageClient: DeveloperHubClient;
        let gitHubClient: GitHubProvider;
        let kubeClient: Kubernetes;

        let gitopsPromotionPRNumber: number;
        let extractedBuildImage: string;

        let RHTAPGitopsNamespace: string;

        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || 'tssc-app';
        const developmentEnvironmentName = 'development';
        const stagingEnvironmentName = 'stage';
        const productionEnvironmentName = 'prod';

        const developmentNamespace = `${componentRootNamespace}-${developmentEnvironmentName}`;
        const stageNamespace = `${componentRootNamespace}-${stagingEnvironmentName}`;
        const prodNamespace = `${componentRootNamespace}-${productionEnvironmentName}`;
        const ciNamespace = `${componentRootNamespace}-ci`;

        const githubOrganization = process.env.GITHUB_ORGANIZATION || '';
        const repositoryName = `${generateRandomChars(9)}-${gptTemplate}`;

        const imageName = "rhtap-qe-"+ `${gptTemplate}`;
        const imageOrg = process.env.IMAGE_REGISTRY_ORG || 'rhtap';
        const imageRegistry = process.env.IMAGE_REGISTRY || 'quay.io';

        /**
         * Initializes Github and Kubernetes client for interaction.
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
         * Waits for the ${softwareTemplateName} component creation task to be completed in Developer Hub.
         * If the task is not completed within the timeout, it writes logs to the specified directory.
         */
        it(`wait ${gptTemplate} component to be finished`, async () => {
            await waitForComponentCreation(backstageClient, repositoryName, developerHubTask);
        }, 120000);

        /**
         * Waits for the specified ArgoCD application associated with the DeveloperHub task to be synchronized in the cluster.
         */
        it(`wait ${gptTemplate} argocd to be synced in the cluster`, async () => {
            expect(await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000)).toBe(true);
        }, 600000);

        /**
         * Verifies if Red Hat Developer Hub created a repository from the specified template.
         * The repository should contain the source code of the application and contains a workflow file.
         */
        it(`verifies if component ${gptTemplate} was created in GitHub and contains a workflow file`, async () => {
            expect(await gitHubClient.checkIfRepositoryExists(githubOrganization, repositoryName)).toBe(true);
            expect(await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, repositoryName, '.github/workflows/build-and-update-gitops.yml')).toBe(true);
        }, 120000);

        /**
         * Verifies if Red Hat Developer Hub created the gitops repository with workflow file
         */
        it(`verifies if component ${gptTemplate} have a valid gitops repository and there exists a workflow file`, async () => {
            expect(await gitHubClient.checkIfRepositoryExists(githubOrganization, `${repositoryName}-gitops`)).toBe(true);
            expect(await gitHubClient.checkIfFolderExistsInRepository(githubOrganization, `${repositoryName}-gitops`, '.github/workflows/gitops-promotion.yml')).toBe(true);
        }, 120000);

        /**
         * Creates secrets for GitHub Actions Workflow
         */
        it (`creates env variables in repo`, async () => {
            const repoDict = [
                {
                    repoName: repositoryName,
                    workflowPath: '.github/workflows/build-and-update-gitops.yml'
                },
                {
                    repoName: `${repositoryName}-gitops`,
                    workflowPath: '.github/workflows/gitops-promotion.yml'
                }
            ];
            for (const repoData of repoDict) {
                await setGitHubActionSecrets(gitHubClient, kubeClient, githubOrganization, repoData.repoName);
                await setGitHubActionVariables(gitHubClient, kubeClient, githubOrganization, repoData.repoName, imageRegistry);
                expect(await gitHubClient.updateWorkflowFileToEnableSecrets(githubOrganization, repoData.repoName, repoData.workflowPath)).not.toBe(undefined);
            }

        }, 600000);

        /**
         * Trigger and wait for Actions job to finish
         */
        it(`trigger and wait for ${gptTemplate} GitHub Actions job`, async () => {
            expect(await gitHubClient.getLatestWorkflowRunStatus(githubOrganization, repositoryName, "TSSC-Build-Attest-Scan-Deploy")).toBe("success");
        }, 300000);

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in development environment
         */
        it('container component is successfully synced by gitops in development environment', async () => {
            console.log("syncing argocd application in development environment");
            await checkComponentSyncedInArgoAndRouteIsWorking(kubeClient, backstageClient, developmentNamespace, developmentEnvironmentName, repositoryName, stringOnRoute);
        }, 900000);

        /**
         * Trigger a promotion Pull Request in Gitops repository to promote development image to stage environment
         */
        it('trigger pull request promotion to promote from development to stage environment', async () => {
            extractedBuildImage = await gitHubClient.extractImageFromContent(githubOrganization, `${repositoryName}-gitops`, repositoryName, developmentEnvironmentName);
            expect(extractedBuildImage).toBeDefined();

            gitopsPromotionPRNumber = await gitHubClient.promoteGitopsImageEnvironment(githubOrganization, `${repositoryName}-gitops`, repositoryName, stagingEnvironmentName, extractedBuildImage);
            expect(gitopsPromotionPRNumber).toBeDefined();
        });

        /**
         * Trigger and wait for Actions job to finish
         */
        it(`trigger and wait for ${gptTemplate} GitHub Actions Promotion-Pipeline job`, async () => {
            expect(await gitHubClient.getLatestWorkflowRunStatus(githubOrganization, `${repositoryName}-gitops`, "TSSC-Promotion-Pipeline")).toBe("success");
        }, 240000);

        /**
         * Merge the gitops Pull Request with the new image value. Expect that argocd will sync the new image in stage
         *
         */
        it(`merge gitops pull request to sync new image in stage environment`, async () => {
            await gitHubClient.mergePullRequest(githubOrganization, `${repositoryName}-gitops`, gitopsPromotionPRNumber);
        }, 120000);

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in staging environment
         */
        it('check container component is successfully synced by gitops in staging environment', async () => {
            await checkComponentSyncedInArgoAndRouteIsWorking(kubeClient, backstageClient, stageNamespace, stagingEnvironmentName, repositoryName, stringOnRoute);
        }, 900000);

        /**
        * Trigger a promotion Pull Request in Gitops repository to promote stage image to prod environment
        */
        it('trigger pull request promotion to promote from stage to prod environment', async () => {
            gitopsPromotionPRNumber = await gitHubClient.promoteGitopsImageEnvironment(githubOrganization, `${repositoryName}-gitops`, repositoryName, productionEnvironmentName, extractedBuildImage);
            expect(gitopsPromotionPRNumber).toBeDefined();
        });

        /**
         * Trigger and wait for Actions job to finish
         */
        it(`trigger and wait for ${gptTemplate} GitHub Actions Promotion-Pipeline job`, async () => {
            expect(await gitHubClient.getLatestWorkflowRunStatus(githubOrganization, `${repositoryName}-gitops`, "TSSC-Promotion-Pipeline")).toBe("success");
        }, 240000);

        /**
         * Merge the gitops Pull Request with the new image value. Expect that argocd will sync the new image in stage
         */
        it(`merge gitops pull request to sync new image in prod environment`, async () => {
            await gitHubClient.mergePullRequest(githubOrganization, `${repositoryName}-gitops`, gitopsPromotionPRNumber);
        }, 120000);

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in prod environment
         */
        it('check container component is successfully synced by gitops in prod environment', async () => {
            await checkComponentSyncedInArgoAndRouteIsWorking(kubeClient, backstageClient, prodNamespace, productionEnvironmentName, repositoryName, stringOnRoute);
        }, 900000);

        /*
         * Verifies if the SBOm is uploaded in RHTPA/Trustification
         */
        it('check sbom uploaded in RHTPA', async () => {
            const jobLogs = await gitHubClient.getJobLogsFromWorkflowName(githubOrganization, repositoryName, "TSSC-Build-Attest-Scan-Deploy");
            const sbomVersion = await parseSbomVersionFromLogs(jobLogs);
            await checkSBOMInTrustification(kubeClient, sbomVersion);
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
