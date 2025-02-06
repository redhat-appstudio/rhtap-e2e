import { beforeAll, expect, it, describe } from "@jest/globals";
import { DeveloperHubClient } from "../../../../src/apis/backstage/developer-hub";
import { TaskIdReponse } from "../../../../src/apis/backstage/types";
import { GitLabProvider } from "../../../../src/apis/git-providers/gitlab";
import { Kubernetes } from "../../../../src/apis/kubernetes/kube";
import { generateRandomChars } from "../../../../src/utils/generator";
import { checkComponentSyncedInArgoAndRouteIsWorking, checkEnvVariablesGitLab, checkSBOMInTrustification, cleanAfterTestGitLab, createTaskCreatorOptionsGitlab, getDeveloperHubClient, getGitLabProvider, getJenkinsCI, getRHTAPRootNamespace } from "../../../../src/utils/test.utils";
import { JenkinsCI } from "../../../../src/apis/ci/jenkins";
import { Utils } from "../../../../src/apis/git-providers/utils";

/**
 * 1. Components get created in Red Hat Developer Hub
 * 2. Check that components gets created successfully in Red Hat Developer Hub
 * 3. Check if Red Hat Developer Hub created GitLab repositories with Jenkinsfiles
 * 4. Commit Jenkins agent settings and enable ACS
 * 5. Creates job in Jenkins
 * 6. Trigger Jenkins Job and wait for finish 
 * 7. Perform an commit in GitLab
 * 8. Trigger Jenkins Job and wait for finish
 * 9. Check if the application is deployed in development namespace and pod is synched
 * 
 * @param softwareTemplateName The name of the software template.
 */
export const gitLabJenkinsAdvancedTests = (softwareTemplateName: string, stringOnRoute: string) => {
    describe(`Red Hat Trusted Application Pipeline ${softwareTemplateName} GPT tests GitLab provider with public/private image registry with promotion pipeline`, () => {

        let backstageClient: DeveloperHubClient;
        let developerHubTask: TaskIdReponse;
        let gitLabProvider: GitLabProvider;
        let kubeClient: Kubernetes;
        let jenkinsClient: JenkinsCI;

        let gitlabRepositoryID: number;
        let gitlabGitOpsRepositoryID: number;
        let gitopsPromotionMergeRequestNumber: number;
        let RHTAPRootNamespace: string;

        const componentRootNamespace = process.env.APPLICATION_ROOT_NAMESPACE || 'rhtap-app';
        const developmentEnvironmentName = 'development';
        const stagingEnvironmentName = 'stage';
        const productionEnvironmentName = 'prod';
        const developmentNamespace = `${componentRootNamespace}-${developmentEnvironmentName}`;
        const stageNamespace = `${componentRootNamespace}-${stagingEnvironmentName}`;
        const prodNamespace = `${componentRootNamespace}-${productionEnvironmentName}`;


        const gitLabOrganization = process.env.GITLAB_ORGANIZATION || '';
        const repositoryName = `${generateRandomChars(9)}-${softwareTemplateName}`;

        const imageName = "rhtap-qe";
        const imageOrg = process.env.QUAY_IMAGE_ORG || '';
        const imageRegistry = process.env.IMAGE_REGISTRY || 'quay.io';

        beforeAll(async () => {
            kubeClient = new Kubernetes();
            RHTAPRootNamespace = await getRHTAPRootNamespace();
            kubeClient = new Kubernetes();
            backstageClient = await getDeveloperHubClient(kubeClient);
            jenkinsClient = await getJenkinsCI(kubeClient);
            gitLabProvider = await getGitLabProvider(kubeClient);
            await checkEnvVariablesGitLab(componentRootNamespace, gitLabOrganization, imageOrg, developmentNamespace, kubeClient);
        });

        /**
        * Creates a task in Developer Hub to generate a new component using specified git and kube options.
        */
        it(`creates ${softwareTemplateName} component`, async () => {
            const taskCreatorOptions = await createTaskCreatorOptionsGitlab(softwareTemplateName, imageName, imageOrg, imageRegistry, gitLabOrganization, repositoryName, componentRootNamespace, "jenkins");

            // Creating a task in Developer Hub to scaffold the component
            developerHubTask = await backstageClient.createDeveloperHubTask(taskCreatorOptions);
        }, 120000);

        /**
        * Waits for the ${softwareTemplateName} component creation task to be completed in Developer Hub.
        * If the task is not completed within the timeout, it writes logs to the specified directory.
        */
        it(`waits for ${softwareTemplateName} component creation to finish`, async () => {
            const taskCreated = await backstageClient.getTaskProcessed(developerHubTask.id, 120000);

            if (taskCreated.status !== 'completed') {
                console.log("Failed to create backstage task. Creating logs...");

                try {
                    const logs = await backstageClient.getEventStreamLog(taskCreated.id);
                    await backstageClient.writeLogsToArtifactDir('backstage-tasks-logs', `gitlab-${repositoryName}.log`, logs);
                } catch (error) {
                    throw new Error(`Failed to write logs to artifact directory: ${error}`);
                }
            } else {
                console.log("Task named " + repositoryName + " created successfully in backstage");
            }
        }, 120000);

        /**
        * Checks if Red Hat Developer Hub created the gitops repository with all our manifests for argoCd
        */
        it(`verifies if component ${softwareTemplateName} was created in GitLab and contains 'Jenkinsfile'`, async () => {
            gitlabRepositoryID = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, repositoryName);
            expect(gitlabRepositoryID).toBeDefined();

            expect(await gitLabProvider.checkIfRepositoryHaveFile(gitlabRepositoryID, 'Jenkinsfile')).toBe(true);
        }, 600000);

        /**
        * Verifies if Red Hat Developer Hub created a repository from the specified template in GitLab.
        * The repository should contain the source code of the application and a Jenkinsfile.
        */
        it(`verifies if component ${softwareTemplateName} have a valid gitops repository and there exists a 'Jenkinsfile'`, async () => {
            gitlabGitOpsRepositoryID = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, `${repositoryName}-gitops`);
            expect(await gitLabProvider.checkIfRepositoryHaveFile(gitlabGitOpsRepositoryID, 'Jenkinsfile')).toBe(true);
        }, 600000);

        /**
        * Waits for the specified ArgoCD application associated with the DeveloperHub task to be synchronized in the cluster.
        */
        it(`wait ${softwareTemplateName} argocd to be synced in the cluster`, async () => {
            expect(await kubeClient.waitForArgoCDApplicationToBeHealthy(`${repositoryName}-development`, 500000)).toBe(true);
        }, 600000);

        /**
        * Creates commits to update Jenkins agent and enable ACS scan
        */
        it(`Commit updated agent ${softwareTemplateName} and enable ACS scan`, async () => {
            await gitLabProvider.updateJenkinsfileAgent(gitlabRepositoryID, 'main');
            await gitLabProvider.updateJenkinsfileAgent(gitlabGitOpsRepositoryID, 'main');

            await gitLabProvider.createUsernameCommit(gitlabRepositoryID, 'main');
            await gitLabProvider.createUsernameCommit(gitlabGitOpsRepositoryID, 'main');

            await gitLabProvider.enableACSJenkins(gitlabRepositoryID, 'main');
            await gitLabProvider.enableACSJenkins(gitlabGitOpsRepositoryID, 'main');

            await gitLabProvider.updateRekorHost(gitlabRepositoryID, 'main', await kubeClient.getRekorServerUrl(RHTAPRootNamespace));
            await gitLabProvider.updateRekorHost(gitlabGitOpsRepositoryID, 'main', await kubeClient.getRekorServerUrl(RHTAPRootNamespace));

            await gitLabProvider.updateTufMirror(gitlabRepositoryID, 'main', await kubeClient.getTUFUrl(RHTAPRootNamespace));
            await gitLabProvider.updateTufMirror(gitlabGitOpsRepositoryID, 'main', await kubeClient.getTUFUrl(RHTAPRootNamespace));
        }, 120000);

        it(`creates ${softwareTemplateName} jenkins job and wait for creation`, async () => {
            await jenkinsClient.createJenkinsJob("gitlab.com", gitLabOrganization, repositoryName);
            await jenkinsClient.waitForJobCreation(repositoryName);
            await gitLabProvider.createProjectWebHook(gitlabRepositoryID, await kubeClient.getDeveloperHubSecret(await getRHTAPRootNamespace(), "developer-hub-rhtap-env", "JENKINS__BASEURL") + "/github-webhook/");
        }, 120000);

        it(`creates ${softwareTemplateName} GitOps jenkins job and wait for creation`, async () => {
            await jenkinsClient.createJenkinsJob("gitlab.com", gitLabOrganization, repositoryName + "-gitops");
            await jenkinsClient.waitForJobCreation(repositoryName + "-gitops");
            await gitLabProvider.createProjectWebHook(gitlabGitOpsRepositoryID, await kubeClient.getDeveloperHubSecret(await getRHTAPRootNamespace(), "developer-hub-rhtap-env", "JENKINS__BASEURL") + "/github-webhook/");
        }, 120000);

        /**
         * Trigger and wait for Jenkins job to finish
         */
        it(`Trigger and wait for ${softwareTemplateName} jenkins job`, async () => {
            await jenkinsClient.buildJenkinsJob(repositoryName);
            console.log('Waiting for the build to start...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            const jobStatus = await jenkinsClient.waitForBuildToFinish(repositoryName, 1, 540000);
            expect(jobStatus).not.toBe(undefined);
            expect(jobStatus).toBe("SUCCESS");
        }, 600000);

        /**
        * Creates an empty commit in the repository and expect that a pipelinerun start. Bug which affect to completelly finish this step: https://issues.redhat.com/browse/RHTAPBUGS-1136
        */
        it(`Creates empty commit to trigger a pipeline run`, async () => {
            await gitLabProvider.createCommit(gitlabRepositoryID, 'main');
        }, 120000);

        /**
        * Trigger and wait for Jenkins job to finish(it will also run deplyment pipeline)
        */
        it(`Trigger job and wait for ${softwareTemplateName} jenkins job to finish`, async () => {
            await jenkinsClient.buildJenkinsJob(repositoryName);
            console.log('Waiting for the build to start...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            const jobStatus = await jenkinsClient.waitForBuildToFinish(repositoryName, 2, 540000);
            expect(jobStatus).not.toBe(undefined);
            expect(jobStatus).toBe("SUCCESS");
        }, 600000);

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in development environment
         */
        it('container component is successfully synced by gitops in development environment', async () => {
            await checkComponentSyncedInArgoAndRouteIsWorking(kubeClient, backstageClient, developmentNamespace, developmentEnvironmentName, repositoryName, stringOnRoute);
        }, 900000);

        /**
         * Trigger and wait for Jenkins job to finish(it will also run deplyment pipeline)
         */
        it(`Trigger job and wait for ${softwareTemplateName} GitOps jenkins job to finish`, async () => {
            await jenkinsClient.buildJenkinsJob(repositoryName + "-gitops");
            console.log('Waiting for the build to start...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            const jobStatus = await jenkinsClient.waitForBuildToFinish(repositoryName + "-gitops", 1, 540000);
            expect(jobStatus).not.toBe(undefined);
            expect(jobStatus).toBe("SUCCESS");
        }, 600000);

        /**
        * Trigger a promotion Pull Request in Gitops repository to promote development image to stage environment
        */
        it('Create merge request to promote from development to stage environment', async () => {
            gitopsPromotionMergeRequestNumber = await gitLabProvider.createMergeRequestWithPromotionImage(gitlabGitOpsRepositoryID, generateRandomChars(6),
                repositoryName, developmentEnvironmentName, stagingEnvironmentName);
            expect(gitopsPromotionMergeRequestNumber).toBeDefined();
        });

        /**
        * Merge the gitops Pull Request with the new image value. Expect that argocd will sync the new image in stage 
        */
        it(`Merge gitops pull request to sync new image in stage environment`, async () => {
            await gitLabProvider.waitForMergeableMergeRequest(gitlabGitOpsRepositoryID, gitopsPromotionMergeRequestNumber, 30000);
            await gitLabProvider.mergeMergeRequest(gitlabGitOpsRepositoryID, gitopsPromotionMergeRequestNumber);
        }, 120000);

        /**
         * Trigger and wait for Jenkins job to finish(it will also run deplyment pipeline)
         */
        it(`Wait for ${softwareTemplateName} jenkins job to finish for promotion from development to stage`, async () => {
            await jenkinsClient.buildJenkinsJob(repositoryName + "-gitops");
            console.log('Waiting for the build to start...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            const jobStatus = await jenkinsClient.waitForBuildToFinish(`${repositoryName}-gitops`, 2, 540000);
            expect(jobStatus).not.toBe(undefined);
            expect(jobStatus).toBe("SUCCESS");
        }, 600000);

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in staging environment
         */
        it('container component is successfully synced by gitops in staging environment', async () => {
            await checkComponentSyncedInArgoAndRouteIsWorking(kubeClient, backstageClient, stageNamespace, stagingEnvironmentName, repositoryName, stringOnRoute);
        }, 900000);

        /**
        * Trigger a promotion Pull Request in Gitops repository to promote stage image to prod environment
        */
        it('trigger pull request promotion to promote from stage to prod environment', async () => {
            gitopsPromotionMergeRequestNumber = await gitLabProvider.createMergeRequestWithPromotionImage(gitlabGitOpsRepositoryID, generateRandomChars(6),
                repositoryName, stagingEnvironmentName, productionEnvironmentName);
            expect(gitopsPromotionMergeRequestNumber).toBeDefined();

        }, 900000);

        /**
         * Merge the gitops Pull Request with the new image value. Expect that argocd will sync the new image in stage 
         */
        it(`merge gitops pull request to sync new image in production environment`, async () => {
            new Utils().sleep(100000);
            await gitLabProvider.waitForMergeableMergeRequest(gitlabGitOpsRepositoryID, gitopsPromotionMergeRequestNumber, 30000);
            await gitLabProvider.mergeMergeRequest(gitlabGitOpsRepositoryID, gitopsPromotionMergeRequestNumber);
        }, 120000);

        /**
        * Trigger and wait for Jenkins job to finish(it will also run deplyment pipeline)
        */
        it(`Trigger job and wait for ${softwareTemplateName} jenkins job to finish promotion pipeline for production environment`, async () => {
            await jenkinsClient.buildJenkinsJob(repositoryName + "-gitops");
            console.log('Waiting for the build to start...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            const jobStatus = await jenkinsClient.waitForBuildToFinish(repositoryName + "-gitops", 3, 540000);
            expect(jobStatus).not.toBe(undefined);
            expect(jobStatus).toBe("SUCCESS");
        }, 600000);

        /**
         * Obtain the openshift Route for the component and verify that the previous builded image was synced in the cluster and deployed in prod environment
         */
        it('container component is successfully synced by gitops in prod environment', async () => {
            await checkComponentSyncedInArgoAndRouteIsWorking(kubeClient, backstageClient, prodNamespace, productionEnvironmentName, repositoryName, stringOnRoute);
        }, 900000);

        /*
        * Verifies if the SBOm is uploaded in RHTPA/Trustification
        */
        it('check sbom uploaded in RHTPA', async () => {
            await checkSBOMInTrustification(kubeClient, repositoryName);
        }, 900000);

        /**
        * Deletes created applications
        */
        afterAll(async () => {
            if (process.env.CLEAN_AFTER_TESTS === 'true') {
                await cleanAfterTestGitLab(gitLabProvider, kubeClient, RHTAPRootNamespace, gitLabOrganization, gitlabRepositoryID, repositoryName);
            }
        });
    });
};
