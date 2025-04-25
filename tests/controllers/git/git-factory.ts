import { Kubernetes } from '../../../src/apis/kubernetes/kube';
import { GitController } from './git-controller';
import { getRHTAPRootNamespace } from '../../../src/utils/test.utils';
import { GithubController } from './github-controller';

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GitFactory {
    static async create(provider: string): Promise<GitController> {
        const kubeClient = new Kubernetes();
        const namespace = await getRHTAPRootNamespace();

        if (provider === 'github') {
            const token = await kubeClient.getDeveloperHubSecret(namespace, "rhtap-github-integration", "token");
            return new GithubController(token);
        }

        throw new Error(`Unsupported provider: ${provider}`);
    }
}
