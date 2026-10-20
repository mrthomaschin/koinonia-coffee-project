/**
 * Web-sized copies of large images (product photos, Notion page images).
 *
 * Originals can be full-resolution camera files (20MB+), which makes pages slow to load and
 * janky to animate. Each source image is resized once into Cloud Storage; later syncs reuse the
 * stored copies (looked up by a hash of the source URL), so the cost is paid only on first sight.
 */
import { createHash } from "crypto";
import sharp from "sharp";
import { getStorageBucket } from "../integrations/firebase_admin";
import { createLogger } from "../logger";

const logger = createLogger("ImageVariants");

const VARIANT_FOLDER = "image-variants/v2";
/** Width for full-size display (item page carousel, content images). */
export const LARGE_WIDTH = 1600;
/** Width for cards and lists (shop grid, related items, cart). */
export const THUMB_WIDTH = 600;

export interface ImageVariants {
    large: string;
    thumb: string;
}

// Source URL -> variants, so repeated syncs in a warm instance skip Storage lookups.
const memo = new Map<string, Promise<ImageVariants>>();

// Decoding full-resolution photos is memory-heavy, so only one is processed at a time.
let resizeQueue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = resizeQueue.then(task, task);
    resizeQueue = run.catch(() => undefined);
    return run;
};

const variantPath = (key: string, width: number) => `${VARIANT_FOLDER}/${key}-${width}.jpg`;

/**
 * Download URLs use a token derived from the file path, so re-saving a variant (e.g. two syncs
 * racing) never invalidates URLs that were already handed out.
 */
const downloadToken = (path: string): string => {
    const hex = createHash("sha256").update(`koinonia-variant:${path}`).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const downloadUrl = (path: string): string =>
    `https://firebasestorage.googleapis.com/v0/b/${getStorageBucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken(path)}`;

const existingUrl = async (path: string): Promise<string | null> => {
    const [exists] = await getStorageBucket().file(path).exists();
    return exists ? downloadUrl(path) : null;
};

const createVariants = async (key: string, source: Buffer): Promise<ImageVariants> => {
    const urls: Record<number, string> = {};
    for (const width of [LARGE_WIDTH, THUMB_WIDTH]) {
        const output = await sharp(source)
            .rotate() // apply EXIF orientation before resizing
            .resize({ width, withoutEnlargement: true })
            .jpeg({ quality: 80, mozjpeg: true })
            .toBuffer();
        const path = variantPath(key, width);
        await getStorageBucket().file(path).save(output, {
            contentType: "image/jpeg",
            metadata: {
                cacheControl: "public, max-age=31536000",
                metadata: { firebaseStorageDownloadTokens: downloadToken(path) },
            },
        });
        urls[width] = downloadUrl(path);
    }
    return { large: urls[LARGE_WIDTH], thumb: urls[THUMB_WIDTH] };
};

/**
 * Returns web-sized copies of an image. `cacheKey` identifies the image version (defaults to the URL;
 * pass something stable for sources whose URL changes, like Notion's signed file URLs).
 * On any failure the original URL is returned for both sizes, so pages still render.
 */
export const getImageVariants = (sourceUrl: string, cacheKey: string = sourceUrl): Promise<ImageVariants> => {
    if (!/^https?:\/\//.test(sourceUrl)) return Promise.resolve({ large: sourceUrl, thumb: sourceUrl });

    const key = createHash("sha1").update(cacheKey).digest("hex").slice(0, 24);
    const cached = memo.get(key);
    if (cached) return cached;

    const pending = (async (): Promise<ImageVariants> => {
        try {
            const [large, thumb] = await Promise.all([
                existingUrl(variantPath(key, LARGE_WIDTH)),
                existingUrl(variantPath(key, THUMB_WIDTH)),
            ]);
            if (large && thumb) return { large, thumb };

            return await enqueue(async () => {
                const response = await fetch(sourceUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return createVariants(key, Buffer.from(await response.arrayBuffer()));
            });
        } catch (error) {
            memo.delete(key); // retry on the next sync
            logger.error("Failed to create image variants", { sourceUrl: sourceUrl.slice(0, 120), error: (error as Error).message });
            return { large: sourceUrl, thumb: sourceUrl };
        }
    })();
    memo.set(key, pending);
    return pending;
};

/** Resolves variants for a list of images, keeping their order. */
export const getImageVariantsList = (sourceUrls: string[]): Promise<ImageVariants[]> =>
    Promise.all(sourceUrls.map((url) => getImageVariants(url)));
