import { beforeAll, describe, expect, it } from '@jest/globals';
import { DeveloperHubClient } from '../../../../src/apis/backstage/developer-hub';
import { TaskIdReponse } from '../../../../src/apis/backstage/types';
import { generateRandomChars } from '../../../../src/utils/generator';
import { BitbucketProvider } from "../../../../src/apis/scm-providers/bitbucket";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { checkComponentSyncedInArgoAndRouteIsWorking, checkEnvVariablesBitbucket, checkIfAcsScanIsPass, cleanAfterTestBitbucket, createTaskCreatorOptionsBitbucket, getDeveloperHubClient, getBitbucketClient, getRHTAPGitopsNamespace, getRHTAPRHDHNamespace, verifySyftImagePath, verifyPipelineRunByRepository } from "../../../../src/utils/test.utils";

/**
 * Advanced end-to-end test scenario for Red Hat Trusted Application Pipelines:
 * 1. Create components in Red Hat Developer Hub.
 * 2. Verify successful creation of components in Red Hat Developer Hub.
 * 3. Ensure Red Hat Developer Hub creates a corresponding Bitbucket repository.
 * 4. Initiate a Pull Request to trigger a PipelineRun for pull_request events in the Bitbucket repository.
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
export const bitbucketSoftwareTemplatesAdvancedScenarios = (gptTemplate: string, stringOnRoute: string) => {
    describe(`Red Hat Trusted Application Pipeline ${gptTemplate} GPT tests Bitbucket provider with public/private image registry`, () => {

        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || 'rhtap-app';

        const developmentEnvironmentName = 'development';
        const stagingEnvironmentName = 'stage';
        const productionEnvironmentName = 'prod';
        const imageName = "rhtap-qe";

        const developmentNamespace = `${componentRootNamespace}-${developmentEnvironmentName}`;
        const stageNamespace = `${componentRootNamespace}-${stagingEnvironmentName}`;
        const prodNamespace = `${componentRootNamespace}-${productionEnvironmentName}`;

        const bitbucketWorkspace = process.env.BITBUCKET_WORKSPACE || '';
        const bitbucketProject = process.env.BITBUCKET_PROJECT || '';
        const repositoryName = `${generateRandomChars(9)}-${gptTemplate}`;
        const gitopsRepoName = `${repositoryName}-gitops`;

        const imageOrg = process.env.QUAY_IMAGE_ORG || '';
        const imageRegistry = process.env.IMAGE_REGISTRY || 'quay.io';

        let bitbucketUsername: string;
        let developerHubTask: TaskIdReponse;
        let backstageClient: DeveloperHubClient;
        let bitbucketClient: BitbucketProvider;
        let kubeClient: Kubernetes;
        let pipelineAsCodeRoute: string;

        let pullRequestID: number;
        let gitopsPromotionPulrequestID: number;

        let RHTAPGitopsNamespace: string;

        /**
         * Initializes Bitbucket and Kubernetes client for interaction. After clients initialization will start to create a test namespace.
         * This namespace should have gitops label: 'argocd.argoproj.io/managed-by': 'openshift-gitops' to allow ArgoCD to create
         * resources
        */
        beforeAll(async()=> {
            RHTAPGitopsNamespace = await getRHTAPGitopsNamespace();
            kubeClient = new Kubernetes();
            bitbucketClient = await getBitbucketClient(kubeClient);
            backstageClient = await getDeveloperHubClient(kubeClient);
            bitbucketUsername = await kubeClient.getDeveloperHubSecret(await getRHTAPRHDHNamespace(), "developer-hub-rhtap-env", "BITBUCKET__USERNAME");

            const componentRoute = await kubeClient.getOpenshiftRoute('pipelines-as-code-controller', 'openshift-pipelines');
            pipelineAsCodeRoute = `https://${componentRoute}`;

            await checkEnvVariablesBitbucket(componentRootNamespace, bitbucketWorkspace, bitbucketProject, imageOrg, developmentNamespace, kubeClient);
        });

        /**
         * Creates a request to Developer Hub and check if the gpt really exists in the catalog
         */
        it(`verifies if ${gptTemplate} gpt exists in the catalog`, async ()=> {
            const goldenPathTemplates = await backstageClient.getGoldenPathTemplates();

            expect(goldenPathTemplates.some(gpt => gpt.metadata.name === gptTemplate)).toBe(true);
        });

        /**
         * Creates a task in Developer Hub to generate a new component using specified git and kube options.
         */
        it(`creates ${gptTemplate} component`, async () => {
            const taskCreatorOptions = await createTaskCreatorOptionsBitbucket(gptTemplate, imageName, imageOrg, imageRegistry, bitbucketUsername, bitbucketWorkspace, bitbucketProject, repositoryName, componentRootNamespace, "tekton");

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
                console.log("failed to create backstage tasks. creating logs...");
                try {
                    const logs = await backstageClient.getEventStreamLog(taskCreated.id);
                    await backstageClient.writeLogsToArtifactDir('backstage-tasks-logs', `bitbucket-${repositoryName}.log`, logs);
                } catch (error) {
                    throw new Error(`failed to write files to console: ${error}`);
                }
            } else {
                console.log("Task created successfully in backstage");
            }
        }, 600000);

        /**
         * Start to verify if Red Hat Developer Hub created repository from our template in Bitbucket. This repository should contain the source code of
         * my application. Also verifies if the repository contains a '.tekton' folder.
         */
        it(`verifies if component ${gptTemplate} was created in Bitbucket and contains '.tekton' folder`, async () => {
            const repositoryExists = await bitbucketClient.checkIfRepositoryExists(bitbucketWorkspace, repositoryName);
            expect(repositoryExists).toBe(true);

            const tektonFolderExists = await bitbucketClient.checkIfFolderExistsInRepository(bitbucketWorkspace, repositoryName, '.tekton');
            expect(tektonFolderExists).toBe(true);
        }, 120000);

        /**
         * Verification to check if Red Hat Developer Hub created the gitops repository with all our manifests for argoCd.
         * Also verifies if the repository contains a '.tekton' folder.
         */
        it(`verifies if component ${gptTemplate} have a valid gitops repository and there exists a '.tekton' folder`, async () => {
            const repositoryExists = await bitbucketClient.checkIfRepositoryExists(bitbucketWorkspace, gitopsRepoName);
            expect(repositoryExists).toBe(true);

            const tektonFolderExists = await bitbucketClient.checkIfFolderExistsInRepository(bitbucketWorkspace, gitopsRepoName, '.tekton');
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
         * Creates an Webhook in the repository for a pipelinerun run.
         */
        it(`Creates webhook in the repository for pipeline run`, async ()=> {
            const hookSource = await bitbucketClient.createRepoWebHook(bitbucketWorkspace, repositoryName, pipelineAsCodeRoute);
            expect(hookSource).not.toBe(undefined);
            const hookGitops = await bitbucketClient.createRepoWebHook(bitbucketWorkspace, gitopsRepoName, pipelineAsCodeRoute);
            expect(hookGitops).not.toBe(undefined);
        }, 120000);

        /**
         * Creates an commit in the repository and expects a PipelineRun to start.
         * This step is used to trigger a PipelineRun by creating a pull request.
         *
         * @throws {Error} Throws an error if the creation of the pull request fails.
         */
        it(`Creates a pull request to trigger a PipelineRun`, async () => {
            const prID = await bitbucketClient.createPullrequest(bitbucketWorkspace, repositoryName, "test.txt", "Hello World!");

            // Set the pull request number if creation was successful
            if (prID !== undefined) {
                pullRequestID = prID;
            } else {
                throw new Error("Failed to create a pull request");
            }
        }, 120000);

        /**
         * Waits until a pipeline run is created in the cluster and start to wait until succeed/fail.
         */
        it(`Wait component ${gptTemplate} pull request pipelinerun to be triggered and finished`, async ()=> {
            const pipelineRunResult = await verifyPipelineRunByRepository(kubeClient, repositoryName, developmentNamespace, 'pull_request');
            expect(pipelineRunResult).toBe(true);
        }, 900000);

        /**
         * Merges a pull request and waits until a pipeline run push is created in the cluster and start to wait until succeed/fail.
         */
        it(`Merge pull_request to trigger a push pipelinerun`, async ()=> {
            await bitbucketClient.mergePullrequest(bitbucketWorkspace, repositoryName, pullRequestID);
        }, 120000);

        /**
         * Waits until a pipeline run is created in the cluster and start to wait until succeed/fail.
         */
        it(`Wait component ${gptTemplate} push pipelinerun to be triggered and finished`, async ()=> {
            const pipelineRunResult = await verifyPipelineRunByRepository(kubeClient, repositoryName, developmentNamespace, 'push');
            expect(pipelineRunResult).toBe(true);
        }, 900000);

        /**
        * Check if the pipelinerun yaml has the rh-syft image path mentioned
        * if failed to figure out the image path ,return pod yaml for reference
        */
        it(`Check ${gptTemplate} pipelinerun yaml has the rh-syft image path`, async () => {
            const result = await verifySyftImagePath(kubeClient, repositoryName, developmentNamespace);
            expect(result).toBe(true);
        }, 900000);

        /**
         * verify if the ACS Scan is successfully done from the logs of task steps
         */
        it(`Check if ACS Scan is successful for ${gptTemplate}`, async ()=> {
            const result = await checkIfAcsScanIsPass(kubeClient, repositoryName, developmentNamespace);
            expect(result).toBe(true);
            console.log("Verified as ACS Scan is Successful");
        }, 900000);

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in development environment
         */
        it('Check container component is successfully synced by gitops in development environment', async () => {
            await checkComponentSyncedInArgoAndRouteIsWorking(kubeClient, backstageClient, developmentNamespace, developmentEnvironmentName, repositoryName, stringOnRoute);
        }, 900000);

        /**
         * Trigger a promotion Pull Request in Gitops repository to promote stage image to prod environment
         */
        it('trigger pull request promotion to promote from development to stage environment', async ()=> {
            gitopsPromotionPulrequestID = await bitbucketClient.createPromotionPullrequest(bitbucketWorkspace, repositoryName, developmentEnvironmentName, stagingEnvironmentName);
            expect(gitopsPromotionPulrequestID).toBeDefined();

            const pipelineRunResult = await verifyPipelineRunByRepository(kubeClient, gitopsRepoName, developmentNamespace, 'pull_request');
            expect(pipelineRunResult).toBe(true);
        }, 900000);

        /**
         * Merge the gitops Pull Request with the new image value. Expect that argocd will sync the new image in stage
         */
        it(`merge gitops pull request to sync new image in stage environment`, async ()=> {
            await bitbucketClient.mergePullrequest(bitbucketWorkspace, gitopsRepoName, gitopsPromotionPulrequestID);
        }, 120000);

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in staging environment
         */
        it('Check container component is successfully synced by gitops in staging environment', async () => {
            await checkComponentSyncedInArgoAndRouteIsWorking(kubeClient, backstageClient,stageNamespace, stagingEnvironmentName, repositoryName, stringOnRoute);
        }, 900000);

        /**
         * Trigger a promotion Pull Request in Gitops repository to promote stage image to prod environment
         */
        it('trigger pull request promotion to promote from stage to prod environment', async ()=> {
            gitopsPromotionPulrequestID = await bitbucketClient.createPromotionPullrequest(bitbucketWorkspace, repositoryName, stagingEnvironmentName, productionEnvironmentName);
            expect(gitopsPromotionPulrequestID).toBeDefined();

            const pipelineRunResult = await verifyPipelineRunByRepository(kubeClient, gitopsRepoName, developmentNamespace, 'pull_request');
            expect(pipelineRunResult).toBe(true);
        }, 900000);

        /**
         * Merge the gitops Pull Request with the new image value. Expect that argocd will sync the new image in prod
         */
        it(`merge gitops pull request to sync new image in prod environment`, async ()=> {
            await bitbucketClient.mergePullrequest(bitbucketWorkspace, gitopsRepoName, gitopsPromotionPulrequestID);
        }, 120000);

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in prod environment
         */
        it('Check container component is successfully synced by gitops in prod environment', async () => {
            await checkComponentSyncedInArgoAndRouteIsWorking(kubeClient, backstageClient, prodNamespace, productionEnvironmentName, repositoryName, stringOnRoute);
        }, 900000);

        /**
         * Deletes created applications
         */
        afterAll(async () => {
            if (process.env.CLEAN_AFTER_TESTS === 'true') {
                await cleanAfterTestBitbucket(bitbucketClient, kubeClient, RHTAPGitopsNamespace, bitbucketWorkspace, repositoryName);
            }
        });
    });
};
