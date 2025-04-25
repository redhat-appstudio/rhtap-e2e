import { ScaffolderScaffoldOptions } from '@backstage/plugin-scaffolder-react/index';
import { Kubernetes } from '../../../src/apis/kubernetes/kube';

export interface GitController {

    /**
     * Creates a Git webhook for push events
     * @param {string} owner - name of the Git organization
     * @param {string} repo - name of the repository
     * @param {string} webhookUrl - webhook URL
     */
    createWebhook(owner: string, repo: string, webhookUrl: string): unknown;

    /**
     * Creates a task in Developer Hub to generate a new component using specified git and kube options.
     * 
     * @param templateRef Refers to the Developer Hub template name.
     * @param values Set of options to create the component.
     * @param owner Developer Hub username who initiates the task.
     * @param name Name of the repository to be created in Git.
     * @param branch Default git branch for the component.
     * @param repoUrl Complete URL of the git provider where the component will be created.
     * @param imageRegistry Image registry provider. Default is Quay.io.
     * @param namespace Kubernetes namespace where ArgoCD will create component manifests.
     * @param imageName Registry image name for the component to be pushed.
     * @param imageOrg Registry organization name for the component to be pushed.
     */
    createTaskCreatorOptions(softwareTemplateName: string, imageName: string, imageOrg: string, imageRegistry: string, gitOrganization: string, repositoryName: string, componentRootNamespace: string, ciType: string): Promise<ScaffolderScaffoldOptions>;

    /**
     * Updates image registry user
     * @param {string} gitOrganization - name of the Git organization
     * @param repositoryName - name of the repository
     * @param imageRegistryUser - name of the image registry user
     */
    updateImageRegistryUser(gitOrganization: string, repositoryName: string, imageRegistryUser: string): Promise<string | undefined>;

    /**
     * Updates rox central endpoint
     * @param {string} gitOrganization - name of the Git organization
     * @param {string} repositoryName - name of the repository
     * @param {string} roxCentralEndpoint - new rox cental endpoint 
     */
    updateRoxCentralEndpoint(gitOrganization: string, repositoryName: string, roxCentralEndpoint: string): Promise<string | undefined>;

    /**
    * Enables ACS scan for testing to the main branch of a specified Git repository.
    * 
    * @param {string} gitOrg - name of the Git organization
    * @param {string} gitRepository - name of the repository where the file will be committed
    * @param {string} tufURL - new tuf URL
    * @returns {Promise<string | undefined>} a Promise resolving to the "true" if commit was successful, otherwise undefined
    */
    updateTUFMirror(gitOrganization: string, repositoryName: string, tufURL: string): Promise<string | undefined>;

    /**
     * Enables ACS scan for testing to the main branch of a specified Git repository.
     * 
     * @param {string} gitOrg - name of the Git organization
     * @param {string} gitRepository - name of the repository where the file will be committed
     * @param {string} rekorHost - new rekor host
     * @returns {Promise<string | undefined>} A Promise resolving to "true" if commit successful, otherwise undefined
     */
    updateRekorHost(gitOrganization: string, repositoryName: string, rekorHost: string): Promise<string | undefined>;

    /**
     * Creates a commit to disable quay.
     * 
     * @param {string} gitOrganization - name of the Git organization
     * @param {string} repositoryName - name of the repository
     */
    disableQuayCommit(gitOrganization: string, repositoryName: string): Promise<string | undefined>;

    /**
     * Create a commit with registry password.
     * 
     * @param {string} gitOrganization - name of the Git organization
     * @param {string} repositoryName - name of the repository
     */
    createRegistryPasswordCommit(gitOrganization: string, repositoryName: string): Promise<string | undefined>;

    /**
     * Creates a commit to delete cosign public key.
     * 
     * @param {string} gitOrganization - name of the Git organization
     * @param {string} repositoryName - name of the repository
     */
    deleteCosignPublicKey(gitOrganization: string, gitRepository: string): Promise<string | undefined>;

    /**
     * Enables ACS scan for testing to the main branch of a specified Git repository.
     * 
     * @param {string} gitOrg - name of the Git organization
     * @param {string} gitRepository - name of the repository where the file will be committed
     * @returns {Promise<string | undefined>} a Promise resolving to the SHA of the commit if successful, otherwise undefined
     */
    enableACSJenkins(gitOrganization: string, repositoryName: string): Promise<string | undefined>;

    /**
     * Commits a Jenkins agent configuration for testing to the main branch of a specified Git repository.
     * 
     * @param {string} gitOrg - name of the Git organization
     * @param {string} gitRepository - name of the repository where the file will be committed
     * @returns {Promise<string | undefined>} a Promise resolving to the SHA of the commit if successful, otherwise undefined
     */
    createAgentCommit(gitOrganization: string, repositoryName: string): Promise<string | undefined>;

    /**
     * Checks environment variables.
     * 
     * @param {string} componentRootNamespace - root namespace of the component
     * @param {string} gitOrganization - name of the Git organization
     * @param {string} imageOrg - organization of the image
     * @param {string} ciNamespace - CI namespace
     * @param {Kubernetes} kubeClient - Kubernetes client
     */
    checkEnvVariables(componentRootNamespace: string, gitOrganization: string, imageOrg: string, ciNamespace: string, kubeClient: Kubernetes): Promise<void>;

    /**
     * Checks if the git repository exists
     * @param {string} organization A valid Git organization
     * @param {string} name A valid Git repository
     */
    checkIfRepositoryExists(gitOrganization: string, repositoryName: string): Promise<boolean>;

    /**
     * Checks if a folder exists in the repository.
     * 
     * @param {string} gitOrganization - name of the Git organization
     * @param {string} repositoryName - name of the Git repository
     * @param {string} folderName - name of a folder
     */
    checkIfFolderExistsInRepository(gitOrganization: string, repositoryName: string, folderName: string): Promise<boolean>;

    /**
     * Commits a file to the main branch of a specified Git repository.
     * 
     * @param {string} gitOrg - name of the Git organization
     * @param {string} gitRepository - name of the repository where the file will be committed
     * @returns {Promise<string | undefined>} a Promise resolving to the SHA of the commit if successful, otherwise undefined
     */
    createCommit(gitOrganization: string, repositoryName: string): Promise<string | undefined>;

    /**
     * Creates a pull request from the main branch.
     * 
     * @param {string} owner - name of the Git organization
     * @param {string} repo - name of the repository
     * @param {string} filePath - path to file in the repository
     * @param {string} content - content of the file
     * @param {string} fileSHA - SHA of the file
     */
    createPullRequestFromMainBranch(owner: string, repo: string, filePath: string, content: string, fileSHA?: string): Promise<number>;

    /**
     * Merges Git pull request.
     * 
     * @param {string} owner - name of the Git organization
     * @param {string} repo - name of the repository
     * @param {string} pullRequest - PR number
     */
    mergePullRequest(owner: string, repo: string, pullRequest: number): Promise<void>;

    /**
     * Extracts image from GitOps repository for promotion.
     * 
     * @param {string} owner -  name of the Git organization
     * @param {string} repo - name of the repository
     * @param {string} componentName - component name
     * @param {string} environment - environment name(development, stage, prod)
     */
    extractImageFromContent(owner: string, repo: string, componentName: string, environment: string): Promise<string>;

    /**
     * Promotes image to environment.
     * 
     * @param {string} owner - name of the Git organization
     * @param {string} repo - name of the repository
     * @param {string} componentName - component name
     * @param {string} environment - environment name(development, stage, prod)
     * @param {string} image - image name
     */
    promoteGitopsImageEnvironment(owner: string, repo: string, componentName: string, environment: string, image: string): Promise<number>;

    /**
     * Cleans after test.
     * 
     * @param {string} gitOrganization - name of the Git organization
     * @param {string} repositoryName - name of the Git repository
     */
    cleanAfterTest(gitOrganization: string, repositoryName: string): Promise<void>;
};
