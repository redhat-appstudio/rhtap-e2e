/* eslint-disable @typescript-eslint/no-explicit-any */
import { exec } from 'child_process';

export const syncArgoApplication = async (namespace: string, applicationName: string) => {
    const scriptCommands = `
        # Check if base64 command exists
        if ! command -v base64 &> /dev/null
        then
            echo "base64 command not found. Aborting script."
            exit 0
        fi
        
        # Check if oc command exists
        if ! command -v oc &> /dev/null
        then
            echo "oc command not found. Aborting script."
            exit 0
        fi

        # Check if argocd command exists
        if ! command -v argocd &> /dev/null
        then
            echo "argocd command not found. Aborting script."
            exit 0
        fi
        sleep 1m

        URL=$(oc get routes rhtap-argocd-server -n ${namespace} -o jsonpath={.spec.host})
        P64=$(oc get secret rhtap-argocd-cluster -n ${namespace} -ojsonpath='{.data.admin\\.password}')
        ARGOPW=$(echo $P64 | base64 --decode -i -)

        argocd login $URL --insecure --grpc-web --username admin --password $ARGOPW

        argocd app sync ${applicationName} --insecure
    `;

    // Execute the shell script commands
    exec(scriptCommands, (error, stdout: any, stderr: any) => {
        if (error) {
            console.error(`Error executing commands: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Commands STDERR: ${stderr}`);
            return;
        }

        console.log(`succesfully synced application ${applicationName} in cluster`);
        console.log(stdout)
    });
}
