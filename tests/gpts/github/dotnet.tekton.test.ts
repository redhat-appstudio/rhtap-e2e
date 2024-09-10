import { gitHubBasicGoldenPathTemplateTests } from "./test-config/github_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

const dotNetTemplateName = 'dotnet-basic';

const runDotNetBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(dotNetTemplateName) && configuration.github.active && configuration.github.tekton) {
        gitHubBasicGoldenPathTemplateTests(dotNetTemplateName);

    } else {
        skipSuite(dotNetTemplateName)
    }
}

runDotNetBasicTests()
