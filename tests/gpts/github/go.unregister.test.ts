import { gitHubBasicGoldenPathTemplateTests } from "./test-config/github_import_template.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

const golangTemplateName = 'go';

const runGolangBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(golangTemplateName) && configuration.github.active) {

        gitHubBasicGoldenPathTemplateTests(golangTemplateName);
    } else {
        skipSuite(golangTemplateName);
    }
}

runGolangBasicTests();
