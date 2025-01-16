import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabProviderGitLabCITests } from "./suites-config/gitlab_gitlabci_suite.ts";

const quarkusTemplateName = 'java-quarkus';
const stringOnRoute =  'Congratulations, you have created a new Quarkus cloud application.';

const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(quarkusTemplateName) && configuration.pipeline.gitlab && configuration.gitlab.gitlabci) {
        gitLabProviderGitLabCITests(quarkusTemplateName, stringOnRoute);
    } else {
        skipSuite(quarkusTemplateName);
    }
};

runQuarkusBasicTests();
