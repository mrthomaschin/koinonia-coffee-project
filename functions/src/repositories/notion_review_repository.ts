import { getNotionClient } from "../integrations/notion/notion_client";
import { getDatabase } from "../integrations/firebase_admin";
import { contentSource } from "../content/content_source";
import { notionText } from "../integrations/notion/notion_properties";
import { NewReview, ReviewModel, ReviewPhoto } from "../domain/reviews/review_model";

/* eslint-disable @typescript-eslint/no-explicit-any */

const databaseId = (): string => {
  const id = process.env.NOTION_PRODUCT_REVIEWS_DATABASE_ID;
  if (!id) throw new Error("NOTION_PRODUCT_REVIEWS_DATABASE_ID is not configured");
  return id;
};

const text = (property: any): string => notionText(property?.rich_text || property?.title).trim();
const richText = (value: string) => ({ rich_text: value ? [{ text: { content: value } }] : [] });

const photosFromFiles = (property: any): ReviewPhoto[] =>
  (property?.files || []).map((file: any): ReviewPhoto | null => {
    if (file.type === "external") return { url: file.external.url, hostedByNotion: false };
    if (file.type === "file") return { url: file.file.url, hostedByNotion: true };
    return null;
  }).filter((photo: ReviewPhoto | null): photo is ReviewPhoto => !!photo);

/** Maps a Notion "Product Reviews" page to a ReviewModel. */
export const reviewFromNotionPage = (page: any): ReviewModel => {
  const props = page.properties || {};
  return {
    id: page.id,
    productName: text(props["Product Name"]),
    productId: text(props["Product ID"]),
    parentProductId: text(props["Parent Product ID"]),
    rating: typeof props["Rating"]?.number === "number" ? props["Rating"].number : 0,
    firstName: text(props["First Name"]),
    lastName: text(props["Last Name"]),
    orderId: text(props["Order #"]),
    purchaseDate: props["Purchase Date"]?.date?.start || null,
    reviewDate: page.created_time,
    text: text(props["Review"]),
    photos: photosFromFiles(props["Photos"]),
    approved: props["Approved"]?.checkbox === true,
    response: text(props["Response"]),
  };
};

/** Maps the given review fields to Notion properties; fields left undefined are not written. */
export const reviewToNotionProperties = (review: Partial<NewReview>): Record<string, unknown> => {
  const properties: Record<string, unknown> = {};
  if (review.productName !== undefined) properties["Product Name"] = { title: [{ text: { content: review.productName } }] };
  if (review.productId !== undefined) properties["Product ID"] = richText(review.productId);
  if (review.parentProductId !== undefined) properties["Parent Product ID"] = richText(review.parentProductId);
  if (review.rating !== undefined) properties["Rating"] = { number: review.rating };
  if (review.firstName !== undefined) properties["First Name"] = richText(review.firstName);
  if (review.lastName !== undefined) properties["Last Name"] = richText(review.lastName);
  if (review.orderId !== undefined) properties["Order #"] = richText(review.orderId);
  if (review.purchaseDate !== undefined) {
    properties["Purchase Date"] = { date: review.purchaseDate ? { start: review.purchaseDate } : null };
  }
  if (review.text !== undefined) properties["Review"] = richText(review.text);
  if (review.photos !== undefined) {
    properties["Photos"] = {
      files: review.photos.map((photo, index) => ({ name: `Photo ${index + 1}`, type: "external", external: { url: photo.url } })),
    };
  }
  if (review.approved !== undefined) properties["Approved"] = { checkbox: review.approved };
  if (review.response !== undefined) properties["Response"] = richText(review.response);
  return properties;
};

// Once reviews are imported to the dashboard they live at reviews/{id} in
// Firestore; every function below reads and writes there instead of Notion.
const useFirestore = async () => (await contentSource("reviews")) === "firestore";
const reviewsCollection = () => getDatabase().collection("reviews");

/** Every review in the database, oldest first. */
export const listReviews = async (): Promise<ReviewModel[]> => {
  if (await useFirestore()) {
    const snapshot = await reviewsCollection().get();
    return snapshot.docs.map((doc) => doc.data() as ReviewModel).sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
  }
  return listNotionReviews();
};

/** Every review in the Notion database (also used by the one-time import). */
export const listNotionReviews = async (): Promise<ReviewModel[]> => {
  const reviews: ReviewModel[] = [];
  let cursor: string | undefined;
  do {
    const response = await getNotionClient().databases.query({
      database_id: databaseId(),
      start_cursor: cursor,
      page_size: 100,
      sorts: [{ timestamp: "created_time", direction: "ascending" }],
    });
    for (const page of response.results) {
      if ("properties" in page) reviews.push(reviewFromNotionPage(page));
    }
    cursor = response.has_more ? response.next_cursor || undefined : undefined;
  } while (cursor);
  return reviews;
};

export const findReviewsByOrder = async (orderId: string): Promise<ReviewModel[]> => {
  if (await useFirestore()) {
    const snapshot = await reviewsCollection().where("orderId", "==", orderId).get();
    return snapshot.docs.map((doc) => doc.data() as ReviewModel);
  }
  const response = await getNotionClient().databases.query({
    database_id: databaseId(),
    filter: { property: "Order #", rich_text: { equals: orderId } },
  });
  return response.results.filter((page) => "properties" in page).map(reviewFromNotionPage);
};

/** Which of these orders have at least one review, in one query per 100 orders. */
export const findReviewedOrderIds = async (orderIds: string[]): Promise<Set<string>> => {
  const reviewed = new Set<string>();
  const unique = [...new Set(orderIds.filter(Boolean))];
  if (await useFirestore()) {
    for (let start = 0; start < unique.length; start += 30) {
      const snapshot = await reviewsCollection().where("orderId", "in", unique.slice(start, start + 30)).select("orderId").get();
      snapshot.docs.forEach((doc) => reviewed.add(doc.data().orderId));
    }
    return reviewed;
  }
  for (let start = 0; start < unique.length; start += 100) {
    const batch = unique.slice(start, start + 100);
    let cursor: string | undefined;
    do {
      const response = await getNotionClient().databases.query({
        database_id: databaseId(),
        start_cursor: cursor,
        page_size: 100,
        filter: { or: batch.map((orderId) => ({ property: "Order #", rich_text: { equals: orderId } })) },
      });
      for (const page of response.results) {
        if ("properties" in page) reviewed.add(reviewFromNotionPage(page).orderId);
      }
      cursor = response.has_more ? response.next_cursor || undefined : undefined;
    } while (cursor);
  }
  return reviewed;
};

/** Creates a review row and returns its Notion page ID. */
export const createReview = async (review: NewReview): Promise<string> => {
  if (await useFirestore()) {
    const ref = reviewsCollection().doc();
    await ref.set({ ...review, id: ref.id, reviewDate: new Date().toISOString() });
    return ref.id;
  }
  const page = await getNotionClient().pages.create({
    parent: { database_id: databaseId() },
    properties: reviewToNotionProperties(review) as any,
  });
  return page.id;
};

export const updateReview = async (id: string, fields: Partial<NewReview>): Promise<void> => {
  if (await useFirestore()) {
    await reviewsCollection().doc(id).set(JSON.parse(JSON.stringify(fields)), { merge: true });
    return;
  }
  await getNotionClient().pages.update({ page_id: id, properties: reviewToNotionProperties(fields) as any });
};

export const getReview = async (id: string): Promise<ReviewModel | null> => {
  const snapshot = await reviewsCollection().doc(id).get();
  return snapshot.exists ? (snapshot.data() as ReviewModel) : null;
};

export const deleteReview = async (id: string): Promise<void> => {
  await reviewsCollection().doc(id).delete();
};

/** Writes a review exactly as given, keeping its id and date (the one-time import). */
export const putReview = async (review: ReviewModel): Promise<void> => {
  await reviewsCollection().doc(review.id).set(JSON.parse(JSON.stringify(review)));
};
