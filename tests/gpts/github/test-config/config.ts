import { z } from "zod";

interface softwareTemplatesConfig {
    templates: string[];
    github: {
        active: boolean;
        tekton: boolean;
        jenkins: boolean;
        host: string;
        registriesConfig: {
            quay: {
                active: boolean;
                host: string;
            };
        };
    };
    gitlab: {
        active: boolean;
        tekton: boolean;
        jenkins: boolean;
        host: string;
        registriesConfig: {
            quay: {
                active: boolean;
                host: string;
            };
        };
    };
}

// Define Zod schema for validation
const softwareTemplateParserValidator = z.object({
    templates: z.array(z.string()).min(1),
    github: z.object({
        active: z.boolean(),
        host: z.string(),
        registriesConfig: z.object({
            quay: z.object({
                active: z.boolean(),
                host: z.string()
            }),
        })
    }).optional(),
    gitlab: z.object({
        active: z.boolean(),
        host: z.string(),
        registriesConfig: z.object({
            quay: z.object({
                active: z.boolean(),
                host: z.string()
            }),
        })
    }).optional()
}).refine(data => {
    if (data.github && data.gitlab && (!data.github.active && !data.gitlab.active)) {
        throw new Error("Seems like none of the Git providers were activated. 'github.active' or 'gitlab.active' must be true");
    }

    if (data.github && data.github.active && !data.github.registriesConfig.quay) {
        throw new Error("Github provider activated but seems like none of the registries to push RHTAP images was activated. registriesConfig.quay' or 'registriesConfig.openshiftRegistry' must be true");
    }

    if (data.gitlab && data.gitlab.active && !data.gitlab.registriesConfig.quay) {
        throw new Error("Gitlab provider activated but seems like none of the registries to push RHTAP images was activated. registriesConfig.quay' or 'registriesConfig.openshiftRegistry' must be true");
    }

    return data;
});

export const loadSoftwareTemplatesTestsGlobals = ():softwareTemplatesConfig => {
    const configuration: softwareTemplatesConfig = global.suites.softwareTemplates

    const validationResult = softwareTemplateParserValidator.safeParse(configuration);

    // Check if validation passed
    if (!validationResult.success) {
        console.error("Validation failed:", validationResult.error);
    }

    return configuration
}
