import { beforeAll, expect, it, describe } from "@jest/globals";
import { DeveloperHubClient } from "../../../../src/apis/backstage/developer-hub";
import { TaskIdReponse } from "../../../../src/apis/backstage/types";
import { GitLabProvider } from "../../../../src/apis/scm-providers/gitlab";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { generateRandomChars } from "../../../../src/utils/generator";
import { checkEnvVariablesGitLab, checkIfAcsScanIsPass, cleanAfterTestGitLab, createTaskCreatorOptionsGitlab, getDeveloperHubClient, getGitLabProvider, getRHTAPGitopsNamespace, verifySyftImagePath, waitForComponentCreation } from "../../../../src/utils/test.utils";
import { Tekton } from '../../../../src/utils/tekton';
import { onPushTasks } from '../../../../src/constants/tekton';

/**
 * 1. Creates a component in Red Hat Developer Hub.
 * 2. Checks that the component is successfully created in Red Hat Developer Hub.
 * 3. Red Hat Developer Hub creates a GitLab repository.
 * 4. Performs a commit in the created GitLab repository to trigger a push PipelineRun.
 * 5. Waits for PipelineRun to start and finish successfully.
 * 
 * @param softwareTemplateName The name of the software template.
 */
export const gitLabProviderBasicTests = (softwareTemplateName: string) => {
    describe(`Red Hat Trusted Application Pipeline ${softwareTemplateName} GPT tests GitLab provider with public/private image registry`, () => {
        jest.retryTimes(3, {logErrorsBeforeRetry: true}); 

        let backstageClient: DeveloperHubClient;
        let developerHubTask: TaskIdReponse;
        let gitLabProvider: GitLabProvider;
        let kubeClient: Kubernetes;
        let tektonClient: Tekton;

        let gitlabRepositoryID: number;
        let pipelineAsCodeRoute: string;

        let RHTAPGitopsNamespace: string;

        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || 'rhtap-app';
        const ciNamespace = `${componentRootNamespace}-ci`;

        const gitLabOrganization = process.env.GITLAB_ORGANIZATION_PUBLIC || '';
        const repositoryName = `${generateRandomChars(9)}-${softwareTemplateName}`;

        const imageName = "rhtap-qe-" + `${softwareTemplateName}`;
        const imageOrg = process.env.IMAGE_REGISTRY_ORG || 'rhtap';
        const imageRegistry = process.env.IMAGE_REGISTRY || 'quay.io';

        beforeAll(async () => {
            RHTAPGitopsNamespace = await getRHTAPGitopsNamespace();

            kubeClient = new Kubernetes();
            tektonClient = new Tekton();
            gitLabProvider = await getGitLabProvider(kubeClient);
            backstageClient = await getDeveloperHubClient(kubeClient);

            const componentRoute = await kubeClient.getOpenshiftRoute('pipelines-as-code-controller', 'openshift-pipelines');
            pipelineAsCodeRoute = `https://${componentRoute}`;

            await checkEnvVariablesGitLab(componentRootNamespace, gitLabOrganization, imageOrg, ciNamespace, kubeClient);
        });

        /**
        * Creates a task in Developer Hub to generate a new component using specified git and kube options.
        * 
        */
        it(`creates ${softwareTemplateName} component`, async () => {
            const taskCreatorOptions = await createTaskCreatorOptionsGitlab(softwareTemplateName, imageName, imageOrg, imageRegistry, gitLabOrganization, repositoryName, componentRootNamespace, "tekton");
            // Creating a task in Developer Hub to scaffold the component
            developerHubTask = await backstageClient.createDeveloperHubTask(taskCreatorOptions);
        }, 120000);

        /**
            * Waits for the ${softwareTemplateName} component creation task to be completed in Developer Hub.
            * If the task is not completed within the timeout, it writes logs to the specified directory.
        */
        it(`waits for ${softwareTemplateName} component creation to finish`, async () => {
            await waitForComponentCreation(backstageClient, repositoryName, developerHubTask);
        }, 120000);

        /**
            * Checks if Red Hat Developer Hub created the gitops repository with all our manifests for argoCd
        */
        it(`verifies if component ${softwareTemplateName} was created in GitLab and contains '.tekton' folder`, async () => {
            gitlabRepositoryID = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, repositoryName);
            expect(gitlabRepositoryID).toBeDefined();

            const tektonFolderExists = await gitLabProvider.checkIfRepositoryHaveFolder(gitlabRepositoryID, '.tekton');
            expect(tektonFolderExists).toBe(true);
        }, 120000);

        /**
            * Verifies if Red Hat Developer Hub created a repository from the specified template in GitHub.
            * The repository should contain the source code of the application and a '.tekton' folder.
        */
        it(`verifies if component ${softwareTemplateName} have a valid gitops repository and there exists a '.tekton' folder`, async () => {
            const repositoryID = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, `${repositoryName}-gitops`);

            const tektonFolderExists = await gitLabProvider.checkIfRepositoryHaveFolder(repositoryID, '.tekton');
            expect(tektonFolderExists).toBe(true);
        }, 120000);

        /**
            * Waits for the specified ArgoCD application associated with the DeveloperHub task to be synchronized in the cluster.
        */
        it(`wait ${softwareTemplateName} argocd to be synced in the cluster`, async () => {
            expect(await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000)).toBe(true);
        }, 600000);

        /**
            * Creates an empty commit in the repository and expect that a pipelinerun start. Bug which affect to completelly finish this step: https://issues.redhat.com/browse/RHTAPBUGS-1136
        */
        it(`Creates empty commit to trigger a pipeline run`, async () => {
            await gitLabProvider.createProjectWebHook(gitlabRepositoryID, pipelineAsCodeRoute);
        }, 120000);

        /**
            * Creates an empty commit in the repository and expect that a pipelinerun start. Bug which affect to completelly finish this step: https://issues.redhat.com/browse/RHTAPBUGS-1136
        */
        it(`Creates empty commit to trigger a pipeline run`, async () => {
            await gitLabProvider.createCommit(gitlabRepositoryID, 'main');
        }, 120000);

        /**
            * Waits until a pipeline run is created in the cluster and start to wait until succeed/fail.
        */
        it(`Wait component ${softwareTemplateName} pipelinerun to be triggered and finished`, async () => {
            const pipelineRunResult = await tektonClient.verifyPipelineRunByRepository(repositoryName, ciNamespace, 'Push', onPushTasks);
            expect(pipelineRunResult).toBe(true);
        }, 900000);

        /**
         * Check if the pipelinerun yaml has the rh-syft image path mentioned
         * if failed to figure out the image path ,return pod yaml for reference
         */
        it(`Check ${softwareTemplateName} pipelinerun yaml has the rh-syft image path`, async () => {
            const result = await verifySyftImagePath(kubeClient, repositoryName, ciNamespace, 'Push');
            expect(result).toBe(true);
        }, 900000);

        /**
         * verify if the ACS Scan is successfully done from the logs of task steps
         */
        it(`Check if ACS Scan is successful for ${softwareTemplateName}`, async () => {
            const result = await checkIfAcsScanIsPass(kubeClient, repositoryName, ciNamespace, 'Push');
            expect(result).toBe(true);
            console.log("Verified as ACS Scan is Successful");
        }, 900000);

        /**
        * Deletes created applications
        */
        afterAll(async () => {
            if (process.env.CLEAN_AFTER_TESTS === 'true') {
                await cleanAfterTestGitLab(gitLabProvider, kubeClient, RHTAPGitopsNamespace, gitLabOrganization, gitlabRepositoryID, repositoryName);
            }
        });
    });
};
