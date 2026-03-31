import { Client, Databases, ID } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const createdIds = [];

  let body = req.bodyJson;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {
      return res.json({ success: false, message: "Invalid JSON body" }, 400);
    }
  }

  const { databaseId, collectionId, documents } = body || {};

  try {
    if (!databaseId || !collectionId || !Array.isArray(documents)) {
      throw new Error("Missing databaseId, collectionId, or documents array.");
    }

    const BATCH_SIZE = 25;
    log(`Processing ${documents.length} documents in batches of ${BATCH_SIZE}...`);

    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const chunk = documents.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        chunk.map(data =>
          databases.createDocument(databaseId, collectionId, ID.unique(), data)
        )
      );

      batchResults.forEach(doc => createdIds.push(doc.$id));
    }

    return res.json({ success: true, count: createdIds.length }, 200);

  } catch (err) {
    error("Transaction failed: " + err.message);

    if (createdIds.length > 0) {
      log(`Rolling back ${createdIds.length} documents...`);
      try {
        // Rollback also benefits from batching if the list is huge
        await Promise.all(
          createdIds.map(id => databases.deleteDocument(databaseId, collectionId, id))
        );
        log("Rollback successful.");
      } catch (rbErr) {
        error("Critical: Rollback failed for IDs: " + createdIds.join(', '));
      }
    }

    return res.json({
      success: false,
      message: err.message,
      rolledBack: createdIds.length > 0,
      failedAtCount: createdIds.length
    }, 500);
  }
};