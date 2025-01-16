import { describe, it } from '@jest/globals';

export const skipSuite = (suiteName: string) => {
    describe(`skiping suite ${suiteName}`, ()=>{
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        it.skip('', ()=>{});
    });
};
