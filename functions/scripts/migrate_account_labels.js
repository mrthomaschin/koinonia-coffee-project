const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const projectId = process.env.GCLOUD_PROJECT
  || process.env.GOOGLE_CLOUD_PROJECT
  || "koinonia-coffee-project";
initializeApp({ credential: applicationDefault(), projectId });

const migrate = async () => {
  const db = getFirestore();
  const snapshot = await db.collection("accounts").get();
  const legacyAccounts = snapshot.docs.filter((account) => !account.data().label);
  if (!legacyAccounts.length) {
    console.log(`No legacy accounts found (${snapshot.size} account(s) checked).`);
    return;
  }

  for (let index = 0; index < legacyAccounts.length; index += 400) {
    const batch = db.batch();
    legacyAccounts.slice(index, index + 400).forEach((account) => {
      batch.set(account.ref, { label: "consumer", updatedAt: Date.now() }, { merge: true });
    });
    await batch.commit();
  }
  console.log(`Updated ${legacyAccounts.length} account(s) with label=consumer.`);
};

migrate().catch((error) => {
  console.error("Account label migration failed:", error.message);
  process.exitCode = 1;
});
