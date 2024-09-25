import { beforeAll, expect, it, describe } from "@jest/globals";
import { DeveloperHubClient } from "../../../../src/apis/backstage/developer-hub";
import { TaskIdReponse } from "../../../../src/apis/backstage/types";
import { GitLabProvider } from "../../../../src/apis/git-providers/gitlab";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { ScaffolderScaffoldOptions } from "@backstage/plugin-scaffolder-react";
import { generateRandomChars } from "../../../../src/utils/generator";
import { cleanAfterTestGitLab, getDeveloperHubClient, getGitLabProvider, getRHTAPRootNamespace, waitForStringInPageContent } from "../../../../src/utils/test.utils";
import { syncArgoApplication } from "../../../../src/utils/argocd";

/**
 * 1. Creates a component in Red Hat Developer Hub.
 * 2. Checks that the component is successfully created in Red Hat Developer Hub.
 * 3. Red Hat Developer Hub creates a GitLab repository.
 * 4. Performs a commit in the created GitLab repository to trigger a push PipelineRun.
 * 5. Waits for PipelineRun to start and finish successfully.
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

            if (componentRootNamespace === '') {
                throw new Error("The 'APPLICATION_TEST_NAMESPACE' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
            }

            if (gitLabOrganization === '') {
                throw new Error("The 'GITLAB_ORGANIZATION' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
            }

            if (quayImageOrg === '') {
                throw new Error("The 'QUAY_IMAGE_ORG' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
            }

            const namespaceExists = await kubeClient.namespaceExists(developmentNamespace)

            if (!namespaceExists) {
                throw new Error(`The development namespace was not created. Make sure you have created ${developmentNamespace} is created and all secrets are created. Example: 'https://github.com/jduimovich/rhdh/blob/main/default-rhtap-ns-configure'`);
            }
        })

        /**
            * Creates a task in Developer Hub to generate a new component using specified git and kube options.
            * 
            * @param {string} templateRef Refers to the Developer Hub template name.
            * @param {object} values Set of options to create the component.
            * @param {string} values.branch Default git branch for the component.
            * @param {string} values.gitlabServer GitLab server URL.
            * @param {string} values.hostType Type of host (e.g., GitLab).
            * @param {string} values.imageName Registry image name for the component to be pushed.
            * @param {string} values.imageOrg Registry organization name for the component to be pushed.
            * @param {string} values.imageRegistry Image registry provider. Default is Quay.io.
            * @param {string} values.name Name of the repository to be created in GitLab.
            * @param {string} values.namespace Kubernetes namespace where ArgoCD will create component manifests.
            * @param {string} values.owner Developer Hub username who initiates the task.
            * @param {string} values.repoName Name of the GitLab repository.
            * @param {string} values.repoOwner Owner of the GitLab repository.
        */
        it(`creates ${softwareTemplateName} component`, async () => {
            const taskCreatorOptions: ScaffolderScaffoldOptions = {
                templateRef: `template:default/${softwareTemplateName}`,
                values: {
                    branch: 'main',
                    glHost: 'gitlab.com',
                    hostType: 'GitLab',
                    imageName: quayImageName,
                    imageOrg: quayImageOrg,
                    imageRegistry: imageRegistry,
                    name: repositoryName,
                    namespace: componentRootNamespace,
                    owner: "user:guest",
                    repoName: repositoryName,
                    glOwner: gitLabOrganization,
                    ciType: "gitlabci"
                }
            };

            // Creating a task in Developer Hub to scaffold the component
            developerHubTask = await backstageClient.createDeveloperHubTask(taskCreatorOptions);
        }, 120000);

        /**
            * Waits for the ${softwareTemplateName} component creation task to be completed in Developer Hub.
            * If the task is not completed within the timeout, it writes logs to the specified directory.
        */
        it(`waits for ${softwareTemplateName} component creation to finish`, async () => {
            const taskCreated = await backstageClient.getTaskProcessed(developerHubTask.id, 120000)

            if (taskCreated.status !== 'completed') {
                console.log("Failed to create backstage task. Creating logs...");

                try {
                    const logs = await backstageClient.getEventStreamLog(taskCreated.id)
                    await backstageClient.writeLogsToArtifactDir('backstage-tasks-logs', `gitlab-${repositoryName}.log`, logs)
                } catch (error) {
                    throw new Error(`Failed to write logs to artifact directory: ${error}`);
                }
            } else {
                console.log("Task created successfully in backstage");
            }
        }, 120000);

        /**
            * Checks if Red Hat Developer Hub created the gitops repository with all our manifests for argoCd
        */
        it(`verifies if component ${softwareTemplateName} was created in GitLab and contains '.gitlab-ci.yml' file`, async () => {
            gitlabRepositoryID = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, repositoryName)
            expect(gitlabRepositoryID).toBeDefined()

            const tektonFolderExists = await gitLabProvider.checkIfRepositoryHaveFile(gitlabRepositoryID, '.gitlab-ci.yml')
            expect(tektonFolderExists).toBe(true)
        }, 60000)

        /**
            * Verifies if Red Hat Developer Hub created a repository from the specified template in GitHub.
            * The repository should contain the source code of the application and a '.tekton' folder.
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
    * Waits for the specified ArgoCD application associated with the DeveloperHub task to be synchronized in the cluster.
*/
        it(`Setup creds for ${softwareTemplateName} pipeline`, async () => {
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "COSIGN_PUBLIC_KEY", await kubeClient.getCosignPublicKey());
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "COSIGN_SECRET_KEY", await kubeClient.getCosignPrivateKey());
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "COSIGN_SECRET_PASSWORD", await kubeClient.getCosignPassword());
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "GITOPS_AUTH_USERNAME", 'fakeUsername');
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "GITOPS_AUTH_PASSWORD", await gitLabProvider.getGitlabToken());
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "QUAY_IO_CREDS_PSW", process.env.QUAY_PASSWORD || '');
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "QUAY_IO_CREDS_USR", process.env.QUAY_USERNAME || '');
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "ROX_API_TOKEN", await kubeClient.getACSToken(await getRHTAPRootNamespace()));
            await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "ROX_CENTRAL_ENDPOINT", await kubeClient.getACSEndpoint(await getRHTAPRootNamespace()));
        }, 600000);


        /**
         * Creates commits to update Jenkins agent and enable ACS scan
         */
        it(`Commit updated agent ${softwareTemplateName} and enable ACS scan`, async () => {
            // Kill initial pipeline to save time
            await gitLabProvider.killInitialPipeline(gitlabRepositoryID);
            // Update env file for GitLab CI vars
            await gitLabProvider.updateEnvFileForGitLabCI(gitlabRepositoryID, 'main', await kubeClient.getRekorServerUrl(RHTAPRootNamespace), await kubeClient.getTUFUrl(RHTAPRootNamespace));
        }, 120000)

        /**
        * Creates an empty commit in the repository and expect that a pipelinerun start. Bug which affect to completelly finish this step: https://issues.redhat.com/browse/RHTAPBUGS-1136
        */
        it(`Wait for a pipeline run`, async () => {
            const response = await gitLabProvider.getLatestPipeline(gitlabRepositoryID);
            await gitLabProvider.waitForPipelineToBeCreated(gitlabRepositoryID, "main", response.sha);

            const pipelineResult = await gitLabProvider.waitForPipelineToFinish(gitlabRepositoryID, response.id);
            expect(pipelineResult).toBe("success");
        }, 360000)

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in development environment
         */
        it('container component is successfully synced by gitops in development environment', async () => {
            console.log("syncing argocd application in development environment")
            await syncArgoApplication(RHTAPRootNamespace, `${repositoryName}-${developmentEnvironmentName}`)
            const componentRoute = await kubeClient.getOpenshiftRoute(repositoryName, developmentNamespace)
            const isReady = await backstageClient.waitUntilComponentEndpointBecomeReady(`https://${componentRoute}`, 10 * 60 * 1000)
            if (!isReady) {
                throw new Error("Component seems was not synced by ArgoCD in 10 minutes");
            }
            expect(await waitForStringInPageContent(`https://${componentRoute}`, stringOnRoute, 120000)).toBe(true)
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