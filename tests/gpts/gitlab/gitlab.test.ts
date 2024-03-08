import { beforeAll, describe, expect, it } from '@jest/globals';
import { DeveloperHubClient } from '../../../src/apis/backstage/developer-hub'
import { TaskIdReponse } from '../../../src/apis/backstage/types';
import { generateRandomName } from '../../../src/utils/generator';
import { GitLabProvider } from "../../../src/apis/git-providers/gitlab";
import { GPTS_TEMPLATES } from '../../../src/constants/index'

const GITHUB_ORGANIZATION = 'rhtap-qe'

describe.skip('Red Hat Trusted Application Pipeline GPTs tests GitLab provider', () => {
    let backstageClient: DeveloperHubClient
    let developerHubTask: TaskIdReponse
    let gitLabProvider: GitLabProvider

    beforeAll(async()=> {
        backstageClient = new DeveloperHubClient();
        gitLabProvider = new GitLabProvider()

        //await kubernetesClient.createPacRepository(GITHUB_ORGANIZATION, REPOSITORY_NAME)
    })

    for (const gptTemplate of GPTS_TEMPLATES) {
        const REPOSITORY_NAME = generateRandomName()

        it(`creates ${gptTemplate} component`, async () => {
            developerHubTask = await backstageClient.createDeveloperHubTask('github.com', GITHUB_ORGANIZATION, REPOSITORY_NAME, gptTemplate)
            console.info(`Component Created with id: ${developerHubTask.id}`)
        }, 120000)

        it(`wait ${gptTemplate} component to be finished`, async () => {
            const taskCreated = await backstageClient.getTaskProcessed(developerHubTask.id, 120000)
            console.info(process.cwd());
    
            expect(taskCreated.status).toBe('completed')
        }, 120000);

        it(`verifies if component ${gptTemplate} was created in GitHub and contains '.tekton' folder`, async () => {
            const repositoryId = await gitLabProvider.checkIfRepositoryExists(GITHUB_ORGANIZATION, REPOSITORY_NAME)    
            const tektonFolderExists = await gitLabProvider.checkIfRepositoryHaveFolder(repositoryId, '.tekton')
            expect(tektonFolderExists).toBe(true)
        })

        it(`verifies if component ${gptTemplate} have a valid gitops repository and there exists a '.tekton' folder`, async () => {
            const repositoryID = await gitLabProvider.checkIfRepositoryExists(GITHUB_ORGANIZATION, `${REPOSITORY_NAME}-gitops`)
    
            const tektonFolderExists = await gitLabProvider.checkIfRepositoryHaveFolder(repositoryID, '.tekton')
            expect(tektonFolderExists).toBe(true)
        })
    }
});
