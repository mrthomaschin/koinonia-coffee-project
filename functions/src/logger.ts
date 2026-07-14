import * as fbLogger from "firebase-functions/logger";

export const createLogger = (tag: string) => ({
    log: (...args: any[]) => fbLogger.log(`[${tag}]`, ...args),
    info: (...args: any[]) => fbLogger.info(`[${tag}]`, ...args),
    warn: (...args: any[]) => fbLogger.warn(`[${tag}]`, ...args),
    error: (...args: any[]) => fbLogger.error(`[${tag}]`, ...args),
});
