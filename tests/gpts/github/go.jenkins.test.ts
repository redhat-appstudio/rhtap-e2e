import { gitHubJenkinsBasicGoldenPathTemplateTests } from "./test-config/github_suite_jenkins.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

const golangTemplateName = 'go';
const stringOnRoute =  'Hello World!';

const runGolangBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(golangTemplateName) && configuration.github.active && configuration.github.jenkins) {
        gitHubJenkinsBasicGoldenPathTemplateTests(golangTemplateName, stringOnRoute);
    } else {
        skipSuite(golangTemplateName);
    }
}

runGolangBasicTests();
