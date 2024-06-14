import axios, { Axios, AxiosResponse } from 'axios';
import { ScaffolderScaffoldOptions, ScaffolderTask } from '@backstage/plugin-scaffolder-react';
import { TaskIdReponse } from './types';
import { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import { Utils } from '../scm-providers/utils';
import * as https from 'https';

/**
 * A client for interacting with the Red Hat Developer Hub backend.
 */
export class DeveloperHubClient extends Utils {
    private readonly RHDHUrl: string;
    private readonly axiosInstance : Axios;

    /**
     * Constructs a new instance of DeveloperHubClient.
     * 
     * @throws {Error} Throws an error if the 'RED_HAT_DEVELOPER_HUB_URL' environment variable is not set.
     */
    constructor(developerHubUrl: string) {
        super();

        if (!developerHubUrl) {
            throw new Error("Cannot initialize DeveloperHubClient, missing 'RED_HAT_DEVELOPER_HUB_URL' environment variable");
        }

        this.RHDHUrl = developerHubUrl;
        this.axiosInstance = axios.create({
            httpAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });
    }

    /**
     * Creates a Developer Hub task based on the provided component creation options.
     * 
     * @param {ScaffolderScaffoldOptions} componentCreateOptions - The options for creating the component.
     * @returns {Promise<TaskIdReponse>} A Promise that resolves to the response containing the task ID.
     * @throws {Error} Throws an error if it fails to create the task or encounters an error during the creation process.
     */
    async createDeveloperHubTask(componentCreateOptions: ScaffolderScaffoldOptions): Promise<TaskIdReponse> {
        try {
            const response: AxiosResponse<TaskIdReponse> = await this.axiosInstance.post(`${this.RHDHUrl}/api/scaffolder/v2/tasks`, componentCreateOptions);
            return response.data;
        } catch (error) {
            console.error(error);

            throw new Error(`Failed to create Developer Hub component:`);
        }
    }

    /**
     * Retrieves Golden Path templates from the Red Hat Developer Hub backend.
     * 
     * @returns {Promise<TemplateEntityV1beta3[]>} A Promise that resolves to an array of Golden Path templates.
     * @throws {Error} Throws an error if it fails to retrieve the templates or encounters an error during retrieval.
     */
    public async getGoldenPathTemplates(): Promise<TemplateEntityV1beta3[]> {
        try {
            const response: AxiosResponse<TemplateEntityV1beta3[]> = await this.axiosInstance.get(`${this.RHDHUrl}/api/catalog/entities?filter=kind=template`);

            return response.data;
        } catch (error) {
            console.error(error);

            throw new Error("Failed to retrieve Golden Path templates");
        }
    }

    /**
     * Retrieves a processed task from the Red Hat Developer Hub backend.
     * 
     * @param {string} taskId - The ID of the task to retrieve.
     * @param {number} timeoutMs - The maximum time to wait for the task to be processed, in milliseconds.
     * @returns {Promise<ScaffolderTask>} A Promise that resolves to the processed task.
     * @throws {Error} Throws an error if it times out waiting for the task to be processed or encounters an error during retrieval.
     */
    async getTaskProcessed(taskId: string, timeoutMs: number): Promise<ScaffolderTask> {
        const delayMs = 5 * 1000;
        let totalTimeMs = 0;

        while (totalTimeMs < timeoutMs) {
            try {
                const response: AxiosResponse<ScaffolderTask> = await this.axiosInstance.get(`${this.RHDHUrl}/api/scaffolder/v2/tasks/${taskId}`);
                if (response.data.status !== "processing" && response.data.status !== "open") {
                    return response.data;
                }

                await this.sleep(delayMs);
                totalTimeMs += delayMs;
            } catch (error) {
                throw new Error(`Error retrieving processed task. Task ID: ${taskId}. Error: ${error}`);
            }
        }

        throw new Error("Timeout to process a task. Error to process a Developer Hub Task");
    }

    /**
     * Retrieves the event stream log for a given task ID from the Red Hat Developer Hub backend.
     * 
     * @param {string} taskId - The ID of the task to retrieve the event stream log for.
     * @returns {Promise<string>} A Promise that resolves to the event stream log for the specified task ID.
     * @throws {Error} Throws an error if it fails to retrieve the event stream log or if the response status is not 200.
     */
    async getEventStreamLog(taskId: string): Promise<string> {
        const response: AxiosResponse<string> = await this.axiosInstance.get(`${this.RHDHUrl}/api/scaffolder/v2/tasks/${taskId}/eventstream`);

        if (response.status !== 200) {
            throw new Error(`Failed to get task event stream logs. Task Id: ${taskId}, status:${response.status}`);
        }

        return response.data;
    }

    public async checkComponentEndpoint(url: string): Promise<boolean> {
        try {
            const response = await axios.get(url);
            return response.status === 200;
        } catch (_) {
            return false;
        }
    }

    public async waitUntilComponentEndpointBecomeReady(url: string, timeoutMs: number): Promise<boolean> {
        const startTime = Date.now();
        let elapsedTime = 0;
        while (elapsedTime < timeoutMs) {
            if (await this.checkComponentEndpoint(url)) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            elapsedTime = Date.now() - startTime;
        }
        return false;
    }

    public async unregisterComponentById(id: string) : Promise<boolean>{
        try {
            const response = await this.axiosInstance.delete(`${this.RHDHUrl}/api/catalog/entities/by-uid/${id}`);

            if (response.status === 204) {
                console.log("Component ID:" + id + " deleted successfully");
                return true;
            } else {
                console.log('Failed to delete component:', response.status, response.statusText);
                return false;
            }
        } catch (error) {
            console.error('Error deleting component:', error);
        }
        return false;
    }

    public async unregisterComponentByName(name: string): Promise<boolean> {
        const componentId = await this.getComponentUid(name);
        if (componentId) {
            console.log("Component ID:" + componentId + " to be deleted");
            return await this.unregisterComponentById(componentId);
        }
        return false;
    }

    public async getComponentUid(name: string): Promise<string | null> {
        try {
            const response = await this.axiosInstance.get(`${this.RHDHUrl}/api/catalog/entities`, {
                params: {
                    filter: `metadata.name=${name}`
                }
            });

            const entities = response.data;
            if (entities.length > 0) {
                return entities[0].metadata.uid;
            } else {
                console.log('Component not found');
                return null;
            }
        } catch (error) {
            console.error('Error fetching component ID:', error);
            return null;
        }
    }

    public async deleteEntitiesByName(name: string): Promise<boolean> {
        try {
            const response = await this.axiosInstance.get(`${this.RHDHUrl}/api/catalog/entities`, {
                params: {
                    filter: `metadata.name=${name}`
                }
            });

            const entities = response.data;
            if (entities.length > 0) {
                let i = 0;
                let returnStatement  = true;
                for (i; i < entities.length; i++) {
                    const entity = entities[i];
                    console.log(entity);
                    returnStatement = returnStatement && await this.unregisterComponentById(entity.metadata.uid);
                }
                return returnStatement;
            } else {
                console.log('Component not found');
                return false;
            }
        } catch (error) {
            console.error('Error fetching component ID:', error);
            return false;
        }
    }

    public async deleteEntitiesBySelector(name: string): Promise<boolean> {
        try {
            const response = await this.axiosInstance.get(`${this.RHDHUrl}/api/catalog/entities`);
            const filteredEntities = response.data.filter((entity) => (entity.kind === 'Component'&& entity.metadata?.name?.includes(name)) || (entity.kind === 'Resource'&& entity.metadata?.name?.includes(name)) || (entity.kind === 'Location' && entity.spec?.target?.includes(name) ));

            if (filteredEntities.length === 0) {
                console.log(`No components found in catalog with the description containing "${name}".`);
                return false;
            }
            const results = await Promise.all(filteredEntities.map(entity => this.unregisterComponentById(entity.metadata.uid)));
            if (results.every(r => r === true)) {
                return true;
            } else {
                return false;
            }
        } catch (error) {
            console.error('Error fetching component ID:', error);
            return false;
        }
    }
      
    public async registerLocation(repositoryName: string): Promise<boolean> {
        try {
            const response = await this.axiosInstance.post(
                `${this.RHDHUrl}/api/catalog/locations`,
                {
                    type: 'url',
                    target: `https://github.com/${process.env.GITHUB_ORGANIZATION}/${repositoryName}/blob/main/catalog-info.yaml`,
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                }
            );

            console.log('Location registered successfully:', response.data);
            return true;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                console.error('Error registering location:', error.response.data);
            } else {
                console.error('Error registering location:', error);
            }
        }
        return false;
    }

}
