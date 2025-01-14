import { skipSuite } from "../../test-utils.ts";
<<<<<<< HEAD
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabProviderGitLabCITests } from "./suites-config/gitlab_gitlabci_suite.ts";
=======
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts"
import { gitLabProviderGitLabCIWithPromotionTests } from "./suites-config/gitlab_gitlabci_advanced.ts";
>>>>>>> 45c51d7 (RHTAP-3358 GitLab CI promotion pipeline)

const quarkusTemplateName = 'java-quarkus';
const stringOnRoute =  'Congratulations, you have created a new Quarkus cloud application.';

const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(quarkusTemplateName) && configuration.gitlab.active && configuration.gitlab.gitlabci) {
        gitLabProviderGitLabCIWithPromotionTests(quarkusTemplateName, stringOnRoute);
    } else {
        skipSuite(quarkusTemplateName);
    }
};

runQuarkusBasicTests();
