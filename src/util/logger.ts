export const createLogger = (tag: string) => ({
    log: (...args: any[]) => console.log(`[${tag}]`, ...args),
    info: (...args: any[]) => console.info(`[${tag}]`, ...args),
    warn: (...args: any[]) => console.warn(`[${tag}]`, ...args),
    error: (...args: any[]) => console.error(`[${tag}]`, ...args),
});
