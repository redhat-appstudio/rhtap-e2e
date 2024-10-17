import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabJenkinsBasicTests } from "./suites-config/gitlab_suite_jenkins.ts";

const golangTemplateName = 'go';
const stringOnRoute =  'Hello World!';

const runGolangBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(golangTemplateName) && configuration.gitlab.active && configuration.gitlab.jenkins) {
        gitLabJenkinsBasicTests(golangTemplateName, stringOnRoute);
    } else {
        skipSuite(golangTemplateName);
    }
}

runGolangBasicTests();
