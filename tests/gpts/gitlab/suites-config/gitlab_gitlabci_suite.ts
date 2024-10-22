import { beforeAll, expect, it, describe } from "@jest/globals";
import { DeveloperHubClient } from "../../../../src/apis/backstage/developer-hub";
import { TaskIdReponse } from "../../../../src/apis/backstage/types";
import { GitLabProvider } from "../../../../src/apis/git-providers/gitlab";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { generateRandomChars } from "../../../../src/utils/generator";
import { checkEnvVariablesGitLab, cleanAfterTestGitLab, createTaskCreatorOptionsGitlab, getCosignPassword, getCosignPrivateKey, getCosignPublicKey, getDeveloperHubClient, getGitLabProvider, getRHTAPRootNamespace, waitForArgoSyncAndRouteContent, waitForComponentCreation } from "../../../../src/utils/test.utils";

/**
 * 1. Creates a component in Red Hat Developer Hub.
 * 2. Checks that the component is successfully created in Red Hat Developer Hub.
 * 3. Red Hat Developer Hub creates a GitLab repository.
 * 4. Performs a commit in the created GitLab repository to trigger a push PipelineRun.
 * 5. Waits for PipelineRun to start and finish successfully.
 * 6. Check deployment of new image.
 * 
 * @param softwareTemplateName The name of the software template.
 */
export const gitLabProviderGitLabCITests = (softwareTemplateName: string, stringOnRoute: string) => {
    describe(`RHTAP ${softwareTemplateName} template test GitLab provider with GitLab CI`, () => {
        jest.retryTimes(2);

        let backstageClient: DeveloperHubClient;
        let developerHubTask: TaskIdReponse;
        let gitLabProvider: GitLabProvider;
        let kubeClient: Kubernetes;

        let gitlabRepositoryID: number;
        let pipelineAsCodeRoute: string;
        let pipelineTriggerToken: "";

        let RHTAPRootNamespace: string;

        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || 'rhtap-app';
        const developmentNamespace = `${componentRootNamespace}-development`;
        const developmentEnvironmentName = 'development';

        const gitLabOrganization = process.env.GITLAB_ORGANIZATION || '';
        const repositoryName = `${generateRandomChars(9)}-${softwareTemplateName}`;

        const quayImageName = "rhtap-qe";
        const quayImageOrg = process.env.QUAY_IMAGE_ORG || '';
        const imageRegistry = process.env.IMAGE_REGISTRY || 'quay.io';

        beforeAll(async () => {
            RHTAPRootNamespace = await getRHTAPRootNamespace();
            kubeClient = new Kubernetes();
            gitLabProvider = await getGitLabProvider(kubeClient);
            backstageClient = await getDeveloperHubClient(kubeClient);

            await checkEnvVariablesGitLab(componentRootNamespace, gitLabOrganization, quayImageOrg, developmentNamespace, kubeClient);
        })

        /**
            * Creates a task in Developer Hub to generate a new component using specified git and kube options.
        */
        it(`creates ${softwareTemplateName} component`, async () => {
            const taskCreatorOptions = await createTaskCreatorOptionsGitlab(softwareTemplateName, quayImageName, quayImageOrg, imageRegistry, gitLabOrganization, repositoryName, componentRootNamespace, "gitlabci");

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
        * Checks if Red Hat Developer Hub created the repository with all our manifests for argoCd
        */
        it(`verifies if component ${softwareTemplateName} was created in GitLab and contains '.gitlab-ci.yml' file`, async () => {
            gitlabRepositoryID = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, repositoryName)
            expect(gitlabRepositoryID).toBeDefined()

            const tektonFolderExists = await gitLabProvider.checkIfRepositoryHaveFile(gitlabRepositoryID, '.gitlab-ci.yml')
            expect(tektonFolderExists).toBe(true)
        }, 60000)

        /**
        * Verifies if Red Hat Developer Hub created a gitops repository from the specified template in GitHub.
        */
        it(`verifies if component ${softwareTemplateName} have a valid gitops repository and there exists a '.gitlab-ci.yml' file`, async () => {
            const repositoryID = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, `${repositoryName}-gitops`)

            const tektonFolderExists = await gitLabProvider.checkIfRepositoryHaveFile(repositoryID, '.gitlab-ci.yml')
            expect(tektonFolderExists).toBe(true)
        }, 60000)

        /**
        * Waits for the specified ArgoCD application associated with the DeveloperHub task to be synchronized in the cluster.
        */
        it(`wait ${softwareTemplateName} argocd to be synced in the cluster`, async () => {
            expect(await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000)).toBe(true);
        }, 600000);

        /**
        * Setup env cvariables for gitlab runner in repository settings.
        */
        it(`Setup creds for ${softwareTemplateName} pipeline in repository`, async () => {
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "COSIGN_PUBLIC_KEY", await getCosignPublicKey(kubeClient));
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "COSIGN_SECRET_KEY", await getCosignPrivateKey(kubeClient));
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "COSIGN_SECRET_PASSWORD", await getCosignPassword(kubeClient));
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "GITOPS_AUTH_USERNAME", 'fakeUsername');
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "GITOPS_AUTH_PASSWORD", await gitLabProvider.getGitlabToken());
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "QUAY_IO_CREDS_PSW", process.env.QUAY_PASSWORD || '');
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "QUAY_IO_CREDS_USR", process.env.QUAY_USERNAME || '');
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "ROX_API_TOKEN", await kubeClient.getACSToken(await getRHTAPRootNamespace()));
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "ROX_CENTRAL_ENDPOINT", await kubeClient.getACSEndpoint(await getRHTAPRootNamespace()));
        }, 600000);


        /**
         * Cancel initial pipeline(runs without correct env wars) and update RHTAP env file in repository with correct URLs
         */
        it(`Commit updated RHTAP env file for ${softwareTemplateName} and enable ACS scan`, async () => {
            // Kill initial pipeline to save time
            await gitLabProvider.killInitialPipeline(gitlabRepositoryID);
            // Update env file for GitLab CI vars
            await gitLabProvider.updateEnvFileForGitLabCI(gitlabRepositoryID, 'main', await kubeClient.getRekorServerUrl(RHTAPRootNamespace), await kubeClient.getTUFUrl(RHTAPRootNamespace));
        }, 120000)

        /**
        * Waits for pipeline after commit RHTAP ENV
        */
        it(`Wait for a pipeline run to finish`, async () => {
            const response = await gitLabProvider.getLatestPipeline(gitlabRepositoryID);
            await gitLabProvider.waitForPipelineToBeCreated(gitlabRepositoryID, "main", response.sha);

            const pipelineResult = await gitLabProvider.waitForPipelineToFinish(gitlabRepositoryID, response.id);
            expect(pipelineResult).toBe("success");
        }, 360000)

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in development environment
         */
        it('container component is successfully synced by gitops in development environment', async () => {
            await waitForArgoSyncAndRouteContent(kubeClient, backstageClient, developmentNamespace, developmentEnvironmentName, repositoryName, stringOnRoute);
        }, 900000)

        /**
        * Deletes created applications
        */
        afterAll(async () => {
            if (process.env.CLEAN_AFTER_TESTS === 'true') {
                await cleanAfterTestGitLab(gitLabProvider, kubeClient, RHTAPRootNamespace, gitLabOrganization, gitlabRepositoryID, repositoryName)
            }
        })
    })
}