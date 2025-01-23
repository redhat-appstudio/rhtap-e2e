import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabProviderGitLabCITests } from "./suites-config/gitlab_gitlabci_suite.ts";

const springBootTemplateName = 'java-springboot';
const stringOnRoute =  'Hello World!';

const runSpringBootBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(springBootTemplateName) && configuration.pipeline.gitlab && configuration.gitlab.gitlabci) {
        gitLabProviderGitLabCITests(springBootTemplateName, stringOnRoute);
    } else {
        skipSuite(springBootTemplateName);
    }
};

runSpringBootBasicTests();
