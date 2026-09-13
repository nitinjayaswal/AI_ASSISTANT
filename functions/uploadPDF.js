/**
 * Firebase Cloud Function: uploadPDF
 * 
 * Handles PDF upload, saves to Firebase Storage, extracts text via extractText.js,
 * and records document metadata and chunks in Cloud Firestore.
 */

const { extractText } = require("./extractText");
const admin = require("firebase-admin");

// Lazy initialization of Firebase Admin if in Cloud Function environment
function getDb() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

function getBucket() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.storage().bucket();
}

/**
 * Cloud Function handler for PDF Upload
 */
async function uploadPDFHandler(req, res) {
  try {
    const { title, category, originalName, fileBase64, clientChunks } = req.body;

    if (!fileBase64 && !clientChunks) {
      return res.status(400).json({ error: "No PDF file data or chunks provided." });
    }

    const db = getDb();
    const docRef = db.collection("documents").doc();
    const docId = docRef.id;
    const documentName = title || originalName || "College_Handbook.pdf";

    let chunksToSave = [];
    let fileUrl = "";

    // If PDF binary buffer was provided, upload to Firebase Storage
    if (fileBase64) {
      const buffer = Buffer.from(fileBase64, "base64");
      const bucket = getBucket();
      const storageFile = bucket.file(`documents/${docId}/${originalName || "document.pdf"}`);
      
      await storageFile.save(buffer, {
        contentType: "application/pdf",
        metadata: {
          documentId: docId,
          title: documentName,
          category: category || "General"
        }
      });

      fileUrl = `https://storage.googleapis.com/${bucket.name}/${storageFile.name}`;

      // Extract chunks if not pre-extracted by client
      if (!clientChunks || clientChunks.length === 0) {
        chunksToSave = await extractText(buffer, {
          documentId: docId,
          documentName,
          category: category || "General"
        });
      }
    }

    // If client pre-extracted chunks using PDF.js
    if (clientChunks && clientChunks.length > 0) {
      chunksToSave = clientChunks.map((c, idx) => ({
        documentId: docId,
        documentName,
        category: category || "General",
        pageNumber: c.pageNumber || 1,
        chunkIndex: idx,
        text: c.text,
        createdAt: new Date().toISOString()
      }));
    }

    // Save document metadata
    const docData = {
      id: docId,
      title: documentName,
      originalName: originalName || documentName,
      category: category || "General",
      chunksCount: chunksToSave.length,
      storageUrl: fileUrl,
      uploadDate: new Date().toISOString()
    };

    await docRef.set(docData);

    // Save chunks as subcollection or batch in chunks collection
    const batch = db.batch();
    for (const chunk of chunksToSave) {
      const chunkRef = db.collection("chunks").doc();
      batch.set(chunkRef, {
        ...chunk,
        id: chunkRef.id
      });
    }
    await batch.commit();

    return res.status(200).json({
      success: true,
      documentId: docId,
      title: documentName,
      chunksCount: chunksToSave.length,
      message: "Document successfully processed and indexed into knowledge base."
    });
  } catch (error) {
    console.error("[uploadPDF Function Error]:", error);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { uploadPDFHandler };
