import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabProviderGitLabCITests } from "./suites-config/gitlab_gitlabci_suite.ts";
const golangTemplateName = 'go';
const stringOnRoute =  'Hello World!';

const runGolangBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(golangTemplateName) && configuration.gitlab.active && configuration.gitlab.gitlabci) {

        gitLabProviderGitLabCITests(golangTemplateName, stringOnRoute);
    } else {
        skipSuite(golangTemplateName);
    }
};

runGolangBasicTests();
