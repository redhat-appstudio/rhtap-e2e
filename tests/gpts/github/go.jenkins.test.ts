import { gitHubJenkinsPromotionTemplateTests } from "./test-config/github_advanced_jenkins.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

const golangTemplateName = 'go';
const stringOnRoute =  'Hello World!';

const runGolangBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(golangTemplateName) && configuration.github.active && configuration.github.jenkins) {
        gitHubJenkinsPromotionTemplateTests(golangTemplateName, stringOnRoute);
    } else {
        skipSuite(golangTemplateName);
    }
}

runGolangBasicTests();
