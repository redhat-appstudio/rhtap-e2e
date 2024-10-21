import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabJenkinsBasicTests } from "./suites-config/gitlab_suite_jenkins.ts";

const springBootTemplateName = 'java-springboot';
const stringOnRoute =  'Hello World!';

const runSpringBootBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(springBootTemplateName) && configuration.gitlab.active && configuration.gitlab.jenkins) {
        gitLabJenkinsBasicTests(springBootTemplateName, stringOnRoute)
    } else {
        skipSuite(springBootTemplateName)
    }
}

runSpringBootBasicTests()
