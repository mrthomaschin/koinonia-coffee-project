import EasyPost from "@easypost/api";

let easyPostInstance: InstanceType<typeof EasyPost> | null = null;

/** Lazily creates the process-local EasyPost client. */
export const getEasyPostClient = (): InstanceType<typeof EasyPost> => {
  if (!easyPostInstance) {
    const apiKey = process.env.EASYPOST_API_KEY;
    if (!apiKey) throw new Error("EASYPOST_API_KEY environment variable is not set");
    easyPostInstance = new EasyPost(apiKey);
  }
  return easyPostInstance;
};
