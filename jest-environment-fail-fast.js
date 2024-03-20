import ParentEnvironment from 'jest-environment-node'; 
// or require('jest-environment-jsdom')
// or require('jest-playwright-preset/lib/PlaywrightEnvironment').default

class JestEnvironmentFailFast extends ParentEnvironment {
    failedTest = false;
    
    async handleTestEvent(event, state) {
        if (event.name === 'hook_failure' || event.name === 'test_fn_failure') {
            this.failedTest = true;
        } else if (this.failedTest && event.name === 'test_start') {
            event.test.mode = 'skip';
        }

        if (super.handleTestEvent) {
            await super.handleTestEvent(event, state)
        }
    }
}

export default JestEnvironmentFailFast
