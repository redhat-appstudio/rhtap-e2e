import { DeveloperHubClient } from '../../../../src/apis/backstage/developer-hub';
import { TaskIdReponse } from '../../../../src/apis/backstage/types';
import { generateRandomChars } from '../../../../src/utils/generator';
import { BitbucketProvider } from "../../../../src/apis/scm-providers/bitbucket";
import { JenkinsCI } from "../../../../src/apis/ci/jenkins";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { checkComponentSyncedInArgoAndRouteIsWorking, checkEnvVariablesBitbucket, cleanAfterTestBitbucket, createTaskCreatorOptionsBitbucket, getCosignPublicKey, getDeveloperHubClient, getBitbucketClient, getJenkinsCI, getRHTAPGitopsNamespace, getRHTAPRHDHNamespace, getRHTAPRootNamespace, setSecretsForJenkinsInFolder, waitForComponentCreation } from "../../../../src/utils/test.utils";

/**
 * 1. Components get created in Red Hat Developer Hub
 * 2. Check that components gets created successfully in Red Hat Developer Hub
 * 3. Check if Red Hat Developer Hub created Bitbucket repositories with Jenkinsfiles
 * 4. Commit Jenkins agent settings and enable ACS
 * 5. Creates job in Jenkins
 * 6. Trigger Jenkins Job and wait for finish
 * 7. Perform an commit in Bitbucket
 * 8. Trigger Jenkins Job and wait for finish
 * 9. Check if the application is deployed in development namespace and pod is synched
 */
export const bitbucketJenkinsBasicGoldenPathTemplateTests = (gptTemplate: string, stringOnRoute: string) => {
    describe(`Red Hat Trusted Application Pipeline ${gptTemplate} GPT tests Bitbucket provider with public/private image registry`, () => {
        jest.retryTimes(3, {logErrorsBeforeRetry: true});

        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || 'tssc-app';
        const ciNamespace = `${componentRootNamespace}-ci`;
        const developmentEnvironmentName = 'development';
        const developmentNamespace = `${componentRootNamespace}-${developmentEnvironmentName}`;

        let bitbucketUsername: string;
        const bitbucketWorkspace = process.env.BITBUCKET_WORKSPACE || '';
        const bitbucketProject = process.env.BITBUCKET_PROJECT || '';
        const repositoryName = `${generateRandomChars(9)}-${gptTemplate}`;

        const imageName = "rhtap-qe-"+ `${gptTemplate}`;
        const imageOrg = process.env.IMAGE_REGISTRY_ORG || 'rhtap';
        const imageRegistry = process.env.IMAGE_REGISTRY || 'quay.io';

        let developerHubTask: TaskIdReponse;
        let backstageClient: DeveloperHubClient;
        let bitbucketClient: BitbucketProvider;
        let kubeClient: Kubernetes;

        let RHTAPRootNamespace: string;
        let RHTAPGitopsNamespace: string;
        let jenkinsClient: JenkinsCI;

        /**
         * Initializes Bitbucket and Kubernetes client for interaction. After clients initialization will start to create a test namespace.
         * This namespace should have gitops label: 'argocd.argoproj.io/managed-by': 'openshift-gitops' to allow ArgoCD to create
         * resources
        */
        beforeAll(async () => {
            RHTAPRootNamespace = await getRHTAPRootNamespace();
            RHTAPGitopsNamespace = await getRHTAPGitopsNamespace();
            kubeClient = new Kubernetes();
            bitbucketClient = await getBitbucketClient(kubeClient);
            backstageClient = await getDeveloperHubClient(kubeClient);
            bitbucketUsername = await kubeClient.getDeveloperHubSecret(await getRHTAPRHDHNamespace(), "tssc-developer-hub-env", "BITBUCKET__USERNAME");
            jenkinsClient = await getJenkinsCI(kubeClient);

            await checkEnvVariablesBitbucket(componentRootNamespace, bitbucketWorkspace, bitbucketProject, imageOrg, ciNamespace, kubeClient);

        });

        /**
         * Creates a request to Developer Hub and check if the gpt really exists in the catalog
         */
        it(`Verifies if ${gptTemplate} gpt exists in the catalog`, async () => {
            const goldenPathTemplates = await backstageClient.getGoldenPathTemplates();
            expect(goldenPathTemplates.some(gpt => gpt.metadata.name === gptTemplate)).toBe(true);
        });

        /**
         * Creates a task in Developer Hub to generate a new component using specified scm and kube options.
         *
         * @param templateRef Refers to the Developer Hub template name.
         * @param values Set of options to create the component.
         * @param owner Developer Hub username who initiates the task.
         * @param name Name of the repository to be created in Bitbucket.
         * @param bitbucketUsername Name of the Bitbucket User.
         * @param bitbucketWorkspace Workspace where repository to be created in Bitbucket.
         * @param bitbucketProject Project where repository to be created in Bitbucket.
         * @param branch Default bitbucket branch for the component.
         * @param repoUrl Complete URL of the scm provider where the component will be created.
         * @param imageRegistry Image registry provider. Default is Quay.io.
         * @param namespace Kubernetes namespace where ArgoCD will create component manifests.
         * @param imageName Registry image name for the component to be pushed.
         * @param imageOrg Registry organization name for the component to be pushed.
         */
        it(`Creates ${gptTemplate} component`, async () => {
            const taskCreatorOptions = await createTaskCreatorOptionsBitbucket(gptTemplate, imageName, imageOrg, imageRegistry, bitbucketUsername, bitbucketWorkspace, bitbucketProject, repositoryName, componentRootNamespace, "jenkins");

            // Creating a task in Developer Hub to scaffold the component
            developerHubTask = await backstageClient.createDeveloperHubTask(taskCreatorOptions);
        }, 120000);

        /**
         * Once test send a task to Developer Hub, test start to look for the task until all the steps are processed. Once all the steps are processed
         * test will grab logs in $ROOT_DIR/artifacts/backstage/xxxxx-component-name.log
         */
        it(`Wait ${gptTemplate} component to be finished`, async () => {
            await waitForComponentCreation(backstageClient, repositoryName, developerHubTask);
        }, 120000);

        /**
         * Waits for the specified ArgoCD application associated with the DeveloperHub task to be synchronized in the cluster.
         */
        it(`Wait ${gptTemplate} argocd to be synced in the cluster`, async () => {
            expect(await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000)).toBe(true);
        }, 600000);

        /**
         * Start to verify if Red Hat Developer Hub created repository from our template in Bitbuckeu. This repository should contain the source code of
         * my application. Also verifies if the repository contains a Jenkinsfile.
         */
        it(`Verifies if component ${gptTemplate} was created in Bitbucket and contains Jenkinsfile`, async () => {
            expect(await bitbucketClient.checkIfRepositoryExists(bitbucketWorkspace, repositoryName)).toBe(true);
            expect(await bitbucketClient.checkIfFolderExistsInRepository(bitbucketWorkspace, repositoryName, 'Jenkinsfile')).toBe(true);
        }, 120000);

        /**
         * Creates commits to update Jenkins agent and enable ACS scan
         */
        it(`Commit updated agent for ${gptTemplate} Jenkinsfile and enable ACS scan`, async () => {
            expect(await bitbucketClient.updateEnvFileForJenkinsCI(
                bitbucketWorkspace, repositoryName,
                await kubeClient.getRekorServerUrl(RHTAPRootNamespace),
                await kubeClient.getTUFUrl(RHTAPRootNamespace),
                await kubeClient.getACSEndpoint(RHTAPRootNamespace),
                await getCosignPublicKey(kubeClient),
                process.env.IMAGE_REGISTRY_USERNAME ?? '')
            ).not.toBe(undefined);
            expect(await bitbucketClient.updateJenkinsfileForCI(bitbucketWorkspace, repositoryName)).not.toBe(undefined);
        }, 120000);

        /**
         * Verification to check if Red Hat Developer Hub created the gitops repository with Jenkinsfile
         */
        it(`Verifies if component ${gptTemplate} have a valid gitops repository and there exists a Jenkinsfile`, async () => {
            expect(await bitbucketClient.checkIfRepositoryExists(bitbucketWorkspace, `${repositoryName}-gitops`)).toBe(true);
            expect(await bitbucketClient.checkIfFolderExistsInRepository(bitbucketWorkspace, `${repositoryName}-gitops`, 'Jenkinsfile')).toBe(true);
        }, 120000);

        /**
         * Creates Jenkins folder and job
         */
        it(`Creates ${gptTemplate} jenkins job and wait for creation`, async () => {
            expect(await jenkinsClient.createFolder(repositoryName)).toBe(true);
            expect(await jenkinsClient.createJenkinsJobInFolder("bitbucket.org", bitbucketWorkspace, repositoryName, repositoryName)).toBe(true);
            expect(await jenkinsClient.waitForJobCreationInFolder(repositoryName, repositoryName)).toBe(true);
        }, 120000);

        /**
         * Creates credentials in Jenkins folder
         */
        it(`Create credentials in Jenkins for ${gptTemplate}`, async () => {
            await setSecretsForJenkinsInFolder(jenkinsClient, kubeClient, repositoryName, "bitbucket");
        }, 120000);

        /**
         * Trigger and wait for Jenkins job to finish
         */
        it(`Trigger and wait for ${gptTemplate} jenkins job`, async () => {
            expect(await jenkinsClient.buildJenkinsJobInFolder(repositoryName, repositoryName)).toBeDefined();
            console.log('Waiting for the build to start...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            const jobStatus = await jenkinsClient.waitForJobToFinishInFolder(repositoryName, 1, 540000, repositoryName);
            expect(jobStatus).toBe("SUCCESS");
        }, 900000);

        /**
         * Creates an empty commit
         */
        it(`Creates empty commit in the ${gptTemplate} bitbucket repository`, async () => {
            const commit = await bitbucketClient.createCommit(bitbucketWorkspace, repositoryName, "main", "test.txt", "Hello World!");
            expect(commit).not.toBe(undefined);
        }, 120000);

        /**
         * Trigger and wait for Jenkins job to finish(it will also run deployment pipeline)
         */
        it(`Trigger job and wait for ${gptTemplate} jenkins job to finish`, async () => {
            expect(await jenkinsClient.buildJenkinsJobInFolder(repositoryName, repositoryName)).toBeDefined();
            console.log('Waiting for the build to start...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            const jobStatus = await jenkinsClient.waitForJobToFinishInFolder(repositoryName, 2, 540000, repositoryName);
            expect(jobStatus).toBe("SUCCESS");
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
                await jenkinsClient.deleteJenkinsJobInFolder(repositoryName, repositoryName);
            }
        });
    });

};
