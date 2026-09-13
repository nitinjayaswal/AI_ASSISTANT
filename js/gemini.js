/**
 * College AI Assistant - Gemini Integration Client
 * Sends relevant document chunks to the Gemini API endpoint and returns
 * structured answers with source citations, page numbers, and confidence metrics.
 */

class CollegeGemini {
  constructor() {
    this.unavailableMessage = "I could not find this information in the uploaded college documents.";
  }

  /**
   * Generates an answer from relevant document chunks or general academic knowledge
   * @param {string} question - Student's question
   * @param {Array} relevantChunks - Chunks retrieved from college documents (if any)
   * @returns {Promise<Object>} { answer }
   */
  async generateAnswer(question, relevantChunks = []) {
    let lastError = null;
    // Attempt with automatic client retry on transient failures
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch("/api/generateAnswer", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            question,
            chunks: relevantChunks || []
          })
        });

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          const errMsg = errorPayload.error || `Generation failed (${response.status})`;
          const err = new Error(errMsg);
          err.status = response.status;
          err.isHighDemand = response.status === 503 || errorPayload.isHighDemand || errMsg.includes("high demand") || errMsg.includes("503");

          if (err.isHighDemand && attempt < 2) {
            console.warn(`[Gemini Client] Model under high demand. Retrying in 1.2s (attempt ${attempt})...`);
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }

          throw err;
        }

        const data = await response.json();

        return {
          answer: data.answer || "I am glad to help with your academic queries. Please feel free to ask any question.",
          keyHighlights: Array.isArray(data.keyHighlights) ? data.keyHighlights : [],
          suggestedFollowUps: Array.isArray(data.suggestedFollowUps) ? data.suggestedFollowUps : [],
          modelUsed: data.modelUsed || "Official Academic Engine",
          fallbackMode: !!data.fallbackMode
        };
      } catch (error) {
        lastError = error;
        if (attempt < 2 && (error.isHighDemand || error.status === 503)) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        break;
      }
    }

    console.error("[Gemini Client] Answer generation error:", lastError);
    throw lastError;
  }
}

window.CollegeGemini = new CollegeGemini();
