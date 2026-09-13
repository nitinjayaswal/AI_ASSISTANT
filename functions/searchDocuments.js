/**
 * Firebase Cloud Function: searchDocuments
 * 
 * Searches Firestore document chunks using keyword frequency, exact phrase matches,
 * and title weighting to find the top relevant excerpts for a student query.
 */

const admin = require("firebase-admin");

function getDb() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

/**
 * Stop words filter for higher search accuracy
 */
const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "all", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both",
  "but", "by", "could", "did", "do", "does", "for", "from", "had", "has", "have",
  "he", "her", "here", "how", "i", "if", "in", "into", "is", "it", "its", "me", "my",
  "of", "on", "or", "our", "she", "so", "some", "than", "that", "the", "their",
  "them", "then", "there", "these", "they", "this", "those", "to", "too", "under",
  "until", "up", "very", "was", "we", "were", "what", "when", "where", "which",
  "who", "whom", "why", "will", "with", "would", "you", "your"
]);

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Searches Firestore chunks
 * @param {string} query - Student query
 * @param {number} topK - Number of chunks to retrieve
 * @returns {Promise<Array>} Scored and ranked chunks
 */
async function searchDocumentsCore(query, topK = 4) {
  const db = getDb();
  const snapshot = await db.collection("chunks").limit(100).get();
  
  if (snapshot.empty) {
    return [];
  }

  const queryLower = (query || "").toLowerCase();
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) {
    return [];
  }

  const scored = [];

  snapshot.forEach(doc => {
    const chunk = doc.data();
    let score = 0;
    const textLower = (chunk.text || "").toLowerCase();
    const docNameLower = (chunk.documentName || "").toLowerCase();

    // 1. Exact phrase matching bonus
    if (textLower.includes(queryLower)) {
      score += 30;
    }

    // 2. Title keyword matches
    queryTokens.forEach(token => {
      if (docNameLower.includes(token)) {
        score += 15;
      }
    });

    // 3. Term frequency matching
    queryTokens.forEach(token => {
      const regex = new RegExp(`\\b${token}\\b`, "gi");
      const matches = textLower.match(regex);
      if (matches) {
        score += matches.length * 4;
      } else if (textLower.includes(token)) {
        score += 1.5;
      }
    });

    if (score > 0) {
      scored.push({
        id: doc.id,
        ...chunk,
        score
      });
    }
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * HTTP Handler for searchDocuments
 */
async function searchDocumentsHandler(req, res) {
  try {
    const { query, topK = 4 } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Missing query parameter." });
    }

    const chunks = await searchDocumentsCore(query, topK);
    return res.status(200).json({ chunks });
  } catch (error) {
    console.error("[searchDocuments Error]:", error);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { searchDocumentsHandler, searchDocumentsCore };
