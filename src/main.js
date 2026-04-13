import { Client, Databases, ID } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  // 1. Log Environment Configuration (Masking the API Key)
  log("--- Function Initializing ---");
  log(`Endpoint: ${process.env.APPWRITE_FUNCTION_API_ENDPOINT}`);
  log(`Project ID: ${process.env.APPWRITE_FUNCTION_PROJECT_ID}`);
  log(`API Key exists: ${process.env.APPWRITE_API_KEY ? 'Yes' : 'No'}`);

  if (!process.env.APPWRITE_FUNCTION_API_ENDPOINT || !process.env.APPWRITE_API_KEY) {
    error("Critical: Missing Environment Variables.");
    return res.json({ success: false, message: "Server configuration error" }, 500);
  }

  const client = new Client()
    .setEndpoint("http://local/v1")
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const createdIds = [];

  // 2. Parse Body
  let body = req.bodyJson;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      error("JSON Parsing Error: " + e.message);
      return res.json({ success: false, message: "Invalid JSON body" }, 400);
    }
  }

  const { databaseId, collectionId, documents } = body || {};

  try {
    // 3. Validation Logs
    if (!databaseId || !collectionId || !Array.isArray(documents)) {
      error(`Validation Failed: db=${databaseId}, coll=${collectionId}, docsIsArray=${Array.isArray(documents)}`);
      throw new Error("Missing databaseId, collectionId, or documents array.");
    }

    log(`Payload Validated: Processing ${documents.length} documents.`);

    const BATCH_SIZE = 10; // Lowered batch size for debugging stability
    log(`Batch size set to: ${BATCH_SIZE}`);

    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const chunk = documents.slice(i, i + BATCH_SIZE);
      log(`Starting Batch ${Math.floor(i / BATCH_SIZE) + 1}. Items in chunk: ${chunk.length}`);

      // Timing the request
      const startBatch = Date.now();

      try {
        const batchResults = await Promise.all(
          chunk.map((data, index) => {
            log(`  Queueing document creation: ${i + index + 1}/${documents.length}`);
            return databases.createDocument(databaseId, collectionId, ID.unique(), data);
          })
        );

        const endBatch = Date.now();
        log(`Batch completed in ${endBatch - startBatch}ms`);

        batchResults.forEach(doc => createdIds.push(doc.$id));
      } catch (batchErr) {
        log(`Error occurred during specific batch execution.`);
        throw batchErr; // Re-throw to be caught by the main catch block
      }
    }

    log(`Successfully created ${createdIds.length} documents.`);
    return res.json({ success: true, count: createdIds.length }, 200);

  } catch (err) {
    // 4. DEEP ERROR LOGGING (Crucial for "fetch failed")
    error("--- EXECUTION FAILURE ---");
    error(`Error Name: ${err.name}`);
    error(`Error Message: ${err.message}`);

    if (err.stack) error(`Stack Trace: ${err.stack}`);

    // Node.js "fetch failed" usually contains a 'cause' object (e.g., ECONNREFUSED)
    if (err.cause) {
      error(`Fetch Cause: ${JSON.stringify(err.cause)}`);
    }

    // 5. Rollback with detailed logs
    if (createdIds.length > 0) {
      log(`Rolling back ${createdIds.length} documents...`);
      for (const id of createdIds) {
        try {
          await databases.deleteDocument(databaseId, collectionId, id);
          log(`Rolled back ID: ${id}`);
        } catch (rbErr) {
          error(`Failed to delete ID ${id} during rollback: ${rbErr.message}`);
        }
      }
      log("Rollback attempt finished.");
    }

    return res.json({
      success: false,
      message: err.message,
      cause: err.cause ? err.cause.message : "Check logs",
      failedAtCount: createdIds.length
    }, 500);
  }
};