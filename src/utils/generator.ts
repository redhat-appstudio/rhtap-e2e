export function generateRandomChars(length: number): string {
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    return Array.from({ length }, () => characters[Math.floor(Math.random() * charactersLength)]).join('');
}
