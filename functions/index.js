/**
 * College AI Assistant - Firebase Cloud Functions Entry Point
 * Exports Cloud Functions for uploadPDF, extractText, searchDocuments, and generateAnswer.
 */

const functions = require("firebase-functions");
const cors = require("cors")({ origin: true });

const { uploadPDFHandler } = require("./uploadPDF");
const { searchDocumentsHandler } = require("./searchDocuments");
const { generateAnswerHandler } = require("./generateAnswer");
const { extractText } = require("./extractText");

// 1. Upload PDF & Index Chunks
exports.uploadPDF = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    return uploadPDFHandler(req, res);
  });
});

// 2. Search Chunks in Firestore
exports.searchDocuments = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    return searchDocumentsHandler(req, res);
  });
});

// 3. Generate Answer with Gemini
exports.generateAnswer = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    return generateAnswerHandler(req, res);
  });
});

// 4. Raw Extract Text Utility
exports.extractTextEndpoint = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    try {
      const { fileBase64, metadata } = req.body;
      if (!fileBase64) {
        return res.status(400).json({ error: "Missing fileBase64" });
      }
      const buffer = Buffer.from(fileBase64, "base64");
      const chunks = await extractText(buffer, metadata || {});
      return res.status(200).json({ chunks });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });
});
