import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { gitHubActionsBasicGoldenPathTemplateTests } from "./test-config/github_actions_suite.ts";

const dotNetTemplateName = 'dotnet-basic';
const stringOnRoute =  'Welcome';

const runDotNetBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(dotNetTemplateName) && configuration.pipeline.github && configuration.github.actions) {
        gitHubActionsBasicGoldenPathTemplateTests(dotNetTemplateName, stringOnRoute);
    } else {
        skipSuite(dotNetTemplateName);
    }
};

runDotNetBasicTests();
