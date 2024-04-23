import { describe, it } from '@jest/globals';

export const skipSuite = (suiteName: string) => {
    describe(`skiping suite ${suiteName}`, ()=>{
        it.skip('', ()=>{})
    })
}
// Helllooooaaa