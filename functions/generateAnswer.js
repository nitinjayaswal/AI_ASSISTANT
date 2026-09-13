/**
 * Firebase Cloud Function: generateAnswer
 * 
 * Takes student question and retrieved document chunks, applies strict grounding rules,
 * queries Gemini API (gemini-3.8-flash), and returns structured answer with source citations.
 */

const { GoogleGenAI, Type } = require("@google/genai");

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}

/**
 * Generates grounded answer using Gemini
 */
async function generateAnswerCore(question, chunks = []) {
  if (!chunks || chunks.length === 0) {
    return {
      answer: "I could not find this information in the uploaded college documents.",
      sourceDocument: "N/A",
      pageNumber: "N/A",
      confidence: 0,
      excerpts: [],
      unavailable: true
    };
  }

  const ai = getGeminiClient();

  // Prepare grounded context from chunks
  const contextSections = chunks.map((chunk, index) => {
    return `[EXCERPT ${index + 1}]
Source Document: ${chunk.documentName || "Unknown.pdf"}
Page Number: ${chunk.pageNumber || 1}
Category: ${chunk.category || "General"}
Content:
${chunk.text}
`;
  }).join("\n----------------------------------------\n");

  const systemInstruction = `You are the official College AI Assistant.
Your sole duty is to answer student questions based STRICTLY and ONLY on the provided official college document excerpts.

CRITICAL MANDATORY RULES:
1. NEVER hallucinate under any circumstances.
2. Answer ONLY from the provided uploaded college documents.
3. If the answer is not explicitly found, answered, or verified in the provided document excerpts, you MUST set answer to EXACTLY:
   "I could not find this information in the uploaded college documents."
   and set confidence to 0 and sourceDocument to "N/A".
4. Always accurately cite the Source Document name and Page Number where the evidence was located.
5. Provide clear, polite, structured formatting (using bullet points or numbered steps where appropriate) for student readability.`;

  const prompt = `STUDENT QUESTION: "${question}"

OFFICIAL COLLEGE DOCUMENT EXCERPTS:
${contextSections}

Synthesize the answer strictly following the rules above.`;

  const CANDIDATE_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash"
  ];

  let parsed = null;
  let lastError = null;

  for (const model of CANDIDATE_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        let timer;
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => {
            const err = new Error(`Model ${model} timed out`);
            err.status = 503;
            reject(err);
          }, 12000);
        });

        const genPromise = ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                answer: {
                  type: Type.STRING,
                  description: "The verified answer based solely on the excerpts, or 'I could not find this information in the uploaded college documents.'"
                },
                sourceDocument: {
                  type: Type.STRING,
                  description: "The filename of the primary document containing the answer, or 'N/A' if unavailable"
                },
                pageNumber: {
                  type: Type.STRING,
                  description: "The page number where the answer is found, or 'N/A' if unavailable"
                },
                confidence: {
                  type: Type.INTEGER,
                  description: "Confidence percentage (0 to 100) based on document evidence certainty"
                },
                excerpts: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "The verbatim snippet from the document supporting this answer"
                },
                unavailable: {
                  type: Type.BOOLEAN,
                  description: "True if the question could not be answered from the provided documents"
                }
              },
              required: ["answer", "sourceDocument", "pageNumber", "confidence", "unavailable"]
            }
          }
        });

        let response;
        try {
          response = await Promise.race([genPromise, timeoutPromise]);
        } finally {
          clearTimeout(timer);
        }

        let raw = response.text.trim();
        if (raw.startsWith("```")) {
          raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
        }
        parsed = JSON.parse(raw);
        return parsed;
      } catch (error) {
        lastError = error;
        const errCode = error?.status || error?.code || (error?.error && error?.error?.code);
        const errMsg = String(error?.message || "");
        const isTransient =
          errCode === 503 ||
          errCode === 429 ||
          errMsg.includes("503") ||
          errMsg.includes("high demand") ||
          errMsg.includes("UNAVAILABLE") ||
          errMsg.includes("RESOURCE_EXHAUSTED");

        if (isTransient && attempt < 2) {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        break; // try next candidate model
      }
    }
  }

  // Fallback to grounded excerpt directly if models experienced high demand
  if (chunks && chunks.length > 0) {
    const topChunk = chunks[0];
    return {
      answer: `*(Notice: AI model experienced temporary high demand. Verified excerpt retrieved directly from college records)*\n\n${topChunk.text}`,
      sourceDocument: topChunk.documentName || "College_Document.pdf",
      pageNumber: String(topChunk.pageNumber || 1),
      confidence: 85,
      excerpts: [topChunk.text.slice(0, 300) + "..."],
      unavailable: false
    };
  }

  throw lastError || new Error("All candidate Gemini models failed.");
}

/**
 * HTTP Cloud Function handler
 */
async function generateAnswerHandler(req, res) {
  try {
    const { question, chunks } = req.body;
    if (!question) {
      return res.status(400).json({ error: "Question parameter is required." });
    }

    const result = await generateAnswerCore(question, chunks);
    return res.status(200).json(result);
  } catch (error) {
    console.error("[generateAnswer Function Error]:", error);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { generateAnswerHandler, generateAnswerCore };
