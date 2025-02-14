import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { DeveloperHubClient } from '../../../../src/apis/backstage/developer-hub';
import { TaskIdReponse } from '../../../../src/apis/backstage/types';
import { generateRandomChars } from '../../../../src/utils/generator';
import { BitbucketProvider } from "../../../../src/apis/scm-providers/bitbucket";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { checkComponentSyncedInArgoAndRouteIsWorking, checkEnvVariablesBitbucket, cleanAfterTestBitbucket, createTaskCreatorOptionsBitbucket, getDeveloperHubClient, getBitbucketClient, checkIfAcsScanIsPass, verifySyftImagePath, getRHTAPGitopsNamespace, getRHTAPRHDHNamespace } from "../../../../src/utils/test.utils";

/**
 * 1. Components get created in Red Hat Developer Hub
 * 2. Check that components gets created successfully in Red Hat Developer Hub
 * 3. Red Hat Developer Hub created Bitbucket repository
 * 4. Perform an commit in Bitbucket to trigger a push PipelineRun
 * 5. Wait For PipelineRun to start and finish successfully. This is not done yet. We need SprayProxy in place and
 * wait for RHTAP bug to be solved: https://issues.redhat.com/browse/RHTAPBUGS-1136
 */
export const bitbucketSoftwareTemplateTests = (gptTemplate: string) => {
    describe(`Red Hat Trusted Application Pipeline ${gptTemplate} GPT tests Bitbucket provider with public/private image registry`, () => {
        jest.retryTimes(2);

        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || 'rhtap-app';
        const ciNamespace = `${componentRootNamespace}-ci`;
        const developmentEnvironmentName = 'development';
        const developmentNamespace = `${componentRootNamespace}-${developmentEnvironmentName}`;
        const stringOnRoute =  'Hello World!';

        let bitbucketUsername: string;
        const bitbucketWorkspace = process.env.BITBUCKET_WORKSPACE || '';
        const bitbucketProject = process.env.BITBUCKET_PROJECT || '';
        const repositoryName = `${generateRandomChars(9)}-${gptTemplate}`;

        const imageName = "rhtap-qe";
        const imageOrg = process.env.QUAY_IMAGE_ORG || '';
        const imageRegistry = process.env.IMAGE_REGISTRY || 'quay.io';

        let developerHubTask: TaskIdReponse;
        let backstageClient: DeveloperHubClient;
        let bitbucketClient: BitbucketProvider;
        let kubeClient: Kubernetes;
        let pipelineAsCodeRoute: string;

        let RHTAPGitopsNamespace: string;

        /**
         * Initializes Bitbucket and Kubernetes client for interaction. After clients initialization will start to create a test namespace.
         * This namespace should have gitops label: 'argocd.argoproj.io/managed-by': 'openshift-gitops' to allow ArgoCD to create
         * resources
        */
        beforeAll(async () => {
            RHTAPGitopsNamespace = await getRHTAPGitopsNamespace();
            kubeClient = new Kubernetes();
            bitbucketClient = await getBitbucketClient(kubeClient);
            backstageClient = await getDeveloperHubClient(kubeClient);
            bitbucketUsername = await kubeClient.getDeveloperHubSecret(await getRHTAPRHDHNamespace(), "developer-hub-rhtap-env", "BITBUCKET__USERNAME");

            const componentRoute = await kubeClient.getOpenshiftRoute('pipelines-as-code-controller', 'openshift-pipelines');
            pipelineAsCodeRoute = `https://${componentRoute}`;

            await checkEnvVariablesBitbucket(componentRootNamespace, bitbucketWorkspace, bitbucketProject, imageOrg, ciNamespace, kubeClient);
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
         * @param name Name of the repository to be created in Bitbucket.
         * @param bitbucketUsername Name of the Bitbucket User.
         * @param bitbucketWorkspace Workspace where repository to be created in Bitbucket.
         * @param bitbucketProject Project where repository to be created in Bitbucket.
         * @param branch Default git branch for the component.
         * @param repoUrl Complete URL of the scm provider where the component will be created.
         * @param imageRegistry Image registry provider. Default is Quay.io.
         * @param namespace Kubernetes namespace where ArgoCD will create component manifests.
         * @param imageName Registry image name for the component to be pushed.
         * @param imageOrg Registry organization name for the component to be pushed.
         */
        it(`creates ${gptTemplate} component`, async () => {
            const taskCreatorOptions = await createTaskCreatorOptionsBitbucket(gptTemplate, imageName, imageOrg, imageRegistry, bitbucketUsername, bitbucketWorkspace, bitbucketProject, repositoryName, componentRootNamespace, "tekton");

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
                    await backstageClient.writeLogsToArtifactDir('backstage-tasks-logs', `bitbucket-${repositoryName}.log`, logs);

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
         * Need to wait until application is synced until commit something to Bitbucket and trigger a pipelinerun
         */
        it(`wait ${gptTemplate} argocd to be synced in the cluster`, async () => {
            const argoCDAppISSynced = await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000);
            expect(argoCDAppISSynced).toBe(true);
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
            const repositoryExists = await bitbucketClient.checkIfRepositoryExists(bitbucketWorkspace, `${repositoryName}-gitops`);
            expect(repositoryExists).toBe(true);

            const tektonFolderExists = await bitbucketClient.checkIfFolderExistsInRepository(bitbucketWorkspace, repositoryName, '.tekton');
            expect(tektonFolderExists).toBe(true);
        }, 120000);

        /**
            * Creates an Webhook in the repository for a pipelinerun run.
        */
        it(`Creates webhook in the repository for pipeline run`, async ()=> {
            const hook = await bitbucketClient.createRepoWebHook(bitbucketWorkspace, repositoryName, pipelineAsCodeRoute);
            expect(hook).not.toBe(undefined);
        }, 120000);

        /**
         * Creates an commit in the repository and expect that a pipelinerun start. Bug which affect to completelly finish this step: https://issues.redhat.com/browse/RHTAPBUGS-1136
         */
        it(`Creates empty commit to trigger a pipeline run`, async () => {
            const commit = await bitbucketClient.createCommit(bitbucketWorkspace, repositoryName, "main", "test.txt", "Hello World!");
            expect(commit).not.toBe(undefined);

        }, 120000);

        /**
         * Waits until a pipeline run is created in the cluster and start to wait until succeed/fail.
         */
        it(`Wait component ${gptTemplate} pipelinerun to be triggered and finished`, async () => {
            const pipelineRun = await kubeClient.getPipelineRunByRepository(repositoryName, 'push');

            if (pipelineRun === undefined) {
                throw new Error("Error to read pipelinerun from the cluster. Seems like pipelinerun was never created; verrfy PAC controller logs.");
            }

            if (pipelineRun && pipelineRun.metadata && pipelineRun.metadata.name) {
                const finished = await kubeClient.waitPipelineRunToBeFinished(pipelineRun.metadata.name, ciNamespace, 900000);
                const tskRuns = await kubeClient.getTaskRunsFromPipelineRun(pipelineRun.metadata.name);

                for (const iterator of tskRuns) {
                    if (iterator.status && iterator.status.podName) {
                        await kubeClient.readNamespacedPodLog(iterator.status.podName, ciNamespace);
                    }
                }
                expect(finished).toBe(true);
            }
        }, 900000);

        /**
         * Check if the pipelinerun yaml has the rh-syft image path mentioned
         * if failed to figure out the image path ,return pod yaml for reference
         */
        it(`Check ${gptTemplate} pipelinerun yaml has the rh-syft image path`, async () => {
            const result = await verifySyftImagePath(kubeClient, repositoryName, ciNamespace);
            expect(result).toBe(true);
        }, 900000);

        /**
         * verify if the ACS Scan is successfully done from the logs of task steps
         */
        it(`Check if ACS Scan is successful for ${gptTemplate}`, async () => {
            const result = await checkIfAcsScanIsPass(kubeClient, repositoryName, ciNamespace);
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
        * Deletes created applications
        */
        afterAll(async () => {
            if (process.env.CLEAN_AFTER_TESTS === 'true') {
                await cleanAfterTestBitbucket(bitbucketClient, kubeClient, RHTAPGitopsNamespace, bitbucketWorkspace, repositoryName);
            }
        });
    });

};
