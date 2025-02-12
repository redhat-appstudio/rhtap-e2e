import { z } from "zod";
import * as fs from 'fs';
import * as path from 'path';

interface softwareTemplatesConfig {
    templates: string[];
    priority: string[];
    github: {
        tekton: boolean;
        jenkins: boolean;
        actions: boolean;
        host: string;
    };
    gitlab: {
        tekton: boolean;
        jenkins: boolean;
        gitlabci: boolean;
        host: string;
    };
    bitbucket: {
        tekton: boolean;
        jenkins: boolean;
        host: string;
    };
    pipeline: {
        ocp: string;
        version: string;
        github: boolean;
        gitlab: boolean;
        bitbucket: boolean;
    };
}

// Define Zod schema for validation
const softwareTemplateParserValidator = z.object({
    templates: z.array(z.string()).min(1),
    priority: z.array(z.string()).min(1),
    github: z.object({
        tekton: z.boolean(),
        jenkins: z.boolean(),
        actions: z.boolean(),
        host: z.string()
    }),
    gitlab: z.object({
        tekton: z.boolean(),
        jenkins: z.boolean(),
        gitlabci: z.boolean(),
        host: z.string(),
    }),
    bitbucket: z.object({
        tekton: z.boolean(),
        jenkins: z.boolean(),
        host: z.string(),
    }),
    pipeline: z.object({
        ocp: z.string(),
        version: z.string(),
        github: z.boolean(),
        gitlab: z.boolean(),
        bitbucket: z.boolean(),
    })
}).refine(data => {
    if (!data.pipeline.github && !data.pipeline.gitlab && !data.pipeline.bitbucket) {
        throw new Error("All SCM providers were deactivated. At least one of them can be activated");
    }
    // if pipeline.github is active, one of the tekton, jenkins or actions must be active
    if (data.pipeline.github && (!data.github.tekton && !data.github.jenkins && !data.github.actions)) {
        throw new Error("Github provider activated but none of the CI/CD options were activated. 'tekton', 'jenkins' or 'actions' must be true");
    }
    // if pipeline.gitlab is active, one of the tekton, jenkins or gitlabci must be active
    if (data.pipeline.gitlab && (!data.gitlab.tekton && !data.gitlab.jenkins && !data.gitlab.gitlabci)) {
        throw new Error("Gitlab provider activated but none of the CI/CD options were activated. 'tekton', 'jenkins' or 'gitlabci' must be true");
    }
    // if pipeline.bitbucket is active, one of the tekton or jenkins must be active
    if (data.pipeline.bitbucket && (!data.bitbucket.tekton && !data.bitbucket.jenkins )) {
        throw new Error("Bitbucket provider activated but none of the CI/CD options were activated. 'tekton' or 'jenkins' must be true");
    }

    return data;
});

const softwareTemplatesFile = process.env.SOFTWARE_TEMPLATES_FILE || 'softwareTemplates.json';

export const loadSoftwareTemplatesTestsGlobals = ():softwareTemplatesConfig => {
    console.log("Loading software templates configuration from file:", softwareTemplatesFile);
    const fileContents = fs.readFileSync(softwareTemplatesFile, 'utf-8');
    const configuration: softwareTemplatesConfig = JSON.parse(fileContents);

    const validationResult = softwareTemplateParserValidator.safeParse(configuration);

    // Check if validation passed
    if (!validationResult.success) {
        console.error("Validation failed:", validationResult.error);
    }

    return configuration;
};
