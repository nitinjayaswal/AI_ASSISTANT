/**
 * Firebase Cloud Function Module: extractText
 * 
 * Extracts text from PDF buffer, segments it into structured chunks with page numbers,
 * and prepares it for indexing in Firestore.
 */

const pdfParse = require("pdf-parse");

/**
 * Extracts text page by page from a PDF buffer
 * @param {Buffer} buffer - Raw PDF buffer
 * @param {Object} metadata - Document metadata { documentId, documentName, category }
 * @returns {Promise<Array>} Array of chunk objects
 */
async function extractText(buffer, metadata = {}) {
  const chunks = [];
  
  try {
    // Custom page render handler to capture page numbers
    let currentPage = 1;
    const pageTexts = [];

    const options = {
      pagerender: function(pageData) {
        return pageData.getTextContent().then(function(textContent) {
          let text = "";
          for (let item of textContent.items) {
            text += item.str + " ";
          }
          pageTexts.push({
            pageNumber: pageData.pageIndex + 1,
            text: text.replace(/\s+/g, " ").trim()
          });
          return text;
        });
      }
    };

    const parsed = await pdfParse(buffer, options);

    // If page-level extraction succeeded
    if (pageTexts.length > 0) {
      for (const page of pageTexts) {
        if (page.text.length < 20) continue;

        // Break longer pages into logical chunks of ~350 words with 50-word overlap
        const words = page.text.split(" ");
        const chunkSize = 350;
        const overlap = 50;

        if (words.length <= chunkSize) {
          chunks.push({
            documentId: metadata.documentId || "doc_unknown",
            documentName: metadata.documentName || "Unknown Document",
            category: metadata.category || "General",
            pageNumber: page.pageNumber,
            chunkIndex: chunks.length,
            text: page.text,
            createdAt: new Date().toISOString()
          });
        } else {
          for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
            const chunkWords = words.slice(i, i + chunkSize);
            if (chunkWords.length > 30) {
              chunks.push({
                documentId: metadata.documentId || "doc_unknown",
                documentName: metadata.documentName || "Unknown Document",
                category: metadata.category || "General",
                pageNumber: page.pageNumber,
                chunkIndex: chunks.length,
                text: chunkWords.join(" "),
                createdAt: new Date().toISOString()
              });
            }
          }
        }
      }
    } else {
      // Fallback: full text segmentation
      const fullText = (parsed.text || "").replace(/\s+/g, " ").trim();
      const words = fullText.split(" ");
      const chunkSize = 350;
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunkSlice = words.slice(i, i + chunkSize).join(" ");
        if (chunkSlice.length > 30) {
          chunks.push({
            documentId: metadata.documentId || "doc_unknown",
            documentName: metadata.documentName || "Unknown Document",
            category: metadata.category || "General",
            pageNumber: Math.floor(i / chunkSize) + 1,
            chunkIndex: chunks.length,
            text: chunkSlice,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    return chunks;
  } catch (error) {
    console.error("[extractText] Error parsing PDF:", error);
    throw new Error(`PDF text extraction failed: ${error.message}`);
  }
}

module.exports = { extractText };
