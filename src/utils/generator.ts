export function generateRandomChars(length: number): string {
    if (length < 2) {
        throw new Error("Length must be at least 2 to satisfy the regex pattern.");
    }

    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    
    const firstChar = letters[Math.floor(Math.random() * letters.length)];
    const middleChars = Array.from({ length: length - 2 }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
    const lastChar = 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; // 'abcdefghijklmnopqrstuvwxyz0123456789' has 36 characters

    return firstChar + middleChars + lastChar;
}
