/**
 * College AI Assistant - AI Document Retrieval System
 * Implements intelligent chunk search, scoring, and context preparation.
 */

class CollegeSearch {
  constructor() {
    this.stopWords = new Set([
      "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", 
      "aren't", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", 
      "but", "by", "can", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", 
      "doesn't", "doing", "don't", "down", "during", "each", "few", "for", "from", "further", 
      "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", 
      "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", 
      "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", 
      "itself", "let's", "me", "more", "most", "mustn't", "my", "myself", "no", "nor", "not", 
      "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", 
      "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", 
      "shouldn't", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", 
      "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", 
      "they're", "they've", "this", "those", "through", "to", "too", "under", "until", "up", 
      "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't", 
      "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", 
      "whom", "why", "why's", "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", 
      "you're", "you've", "your", "yours", "yourself", "yourselves"
    ]);
    this.synonymMap = {
      "fail": ["backlog", "arrear", "supplementary", "revaluation", "grade review"],
      "failed": ["backlog", "arrear", "supplementary", "revaluation"],
      "backlog": ["supplementary", "arrear", "revaluation"],
      "attendance": ["75%", "mandatory attendance", "hall ticket", "shortage"],
      "curfew": ["timings", "9:30 pm", "10:00 pm", "night-out pass", "biometric"],
      "timing": ["curfew", "9:30 pm", "10:00 pm", "counter 4"],
      "timings": ["curfew", "9:30 pm", "10:00 pm", "counter 4"],
      "cook": ["prohibited items", "induction stoves", "hot plates", "electric heaters"],
      "cooking": ["prohibited items", "induction stoves", "hot plates", "electric heaters"],
      "induction": ["induction stoves", "induction cooker", "electric heaters", "prohibited items", "hot plates"],
      "cooker": ["induction stoves", "induction cooker", "cooking appliances", "hot plates"],
      "kettle": ["prohibited items", "heavy electrical appliances", "electric heaters"],
      "heater": ["prohibited items", "electric heaters", "fire safety"],
      "jayanti": ["guru nanak jayanti", "birthday", "mahavir jayanti", "valmiki jayanti", "ravidas jayanti"],
      "nanak": ["guru nanak jayanti", "guru nanak dev ji", "birthday", "november 24"],
      "assistance": ["financial assistance", "hostel residents", "scholarship", "grant", "31.01.2026", "dsw"],
      "placement": ["cdpc", "campus placement", "internship", "dream company", "cgpa", "6.5"],
      "placements": ["cdpc", "campus placement", "internship", "dream company", "cgpa", "6.5"],
      "job": ["placement", "campus placement", "salary", "package", "dream company"],
      "jobs": ["placement", "campus placement", "salary", "package", "dream company"],
      "cgpa": ["pointer", "gpa", "6.5", "academic requirement"],
      "holiday": ["list of holidays", "calendar year 2026", "republic day", "diwali", "holi"],
      "holidays": ["list of holidays", "calendar year 2026", "republic day", "diwali", "holi"],
      "vacation": ["holidays", "summer break", "calendar year 2026"],
      "deadline": ["last date", "due date", "cutoff", "31.01.2026"],
      "fee": ["tuition", "payment", "installment", "penalty", "due date"],
      "fees": ["tuition", "payment", "installment", "penalty", "due date"],
      "installment": ["installments", "two equal installments", "50%"],
      "installments": ["installment option", "two equal installments", "50%"],
      "bonafide": ["bonafide certificate", "academic office counter 4", "erp student portal"],
      "scholarship": ["financial assistance", "financial aid", "hostel residents", "dean student welfare"],
      "scholarships": ["financial assistance", "financial aid", "hostel residents"]
    };
  }

  tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 1 && !this.stopWords.has(w));
  }

  /**
   * Search relevant chunks via Server API
   * Returns top matching chunks sorted by relevance score
   */
  async searchDocuments(query, topK = 6) {
    try {
      // Call server-side retrieval API
      const result = await fetch("/api/searchDocuments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, topK })
      });

      if (!result.ok) {
        throw new Error(`Search failed: ${result.statusText}`);
      }

      const data = await result.json();
      return data.chunks || [];
    } catch (err) {
      console.warn("[Search] Server retrieval error, fallback to client-side indexing:", err.message);
      return this.searchClientFallback(query, topK);
    }
  }

  /**
   * Client-side fallback ranking in case offline or local data cache
   */
  async searchClientFallback(query, topK = 6) {
    try {
      const res = await fetch("/api/documents?includeChunks=true");
      if (!res.ok) return [];
      const docs = await res.json();
      
      const allChunks = [];
      for (const doc of docs) {
        if (doc.chunks && Array.isArray(doc.chunks)) {
          allChunks.push(...doc.chunks);
        }
      }

      const queryClean = (query || "").trim();
      const queryTokens = this.tokenize(queryClean);
      if (queryTokens.length === 0) return allChunks.slice(0, topK);

      const queryLower = queryClean.toLowerCase();

      // Synonym expansion
      const synonymTokens = [];
      queryTokens.forEach(t => {
        const syns = this.synonymMap[t];
        if (syns) {
          syns.forEach(s => {
            this.tokenize(s).forEach(st => {
              if (!queryTokens.includes(st) && !synonymTokens.includes(st)) {
                synonymTokens.push(st);
              }
            });
          });
        }
      });

      // BM25 IDF calculation
      const N = allChunks.length;
      let totalTokens = 0;
      const docFreq = new Map();
      const chunkTokensMap = new Map();

      allChunks.forEach(c => {
        const tokens = this.tokenize(c.text);
        chunkTokensMap.set(c.id, tokens);
        totalTokens += tokens.length;
        const unique = new Set(tokens);
        unique.forEach(tok => {
          docFreq.set(tok, (docFreq.get(tok) || 0) + 1);
        });
      });

      const avgdl = totalTokens / (N || 1);
      const k1 = 1.2;
      const b = 0.75;

      const scored = allChunks.map(chunk => {
        const chunkTokens = chunkTokensMap.get(chunk.id) || [];
        const textLower = (chunk.text || "").toLowerCase();
        const docNameLower = (chunk.documentName || "").toLowerCase();
        const docLen = chunkTokens.length;

        const tfMap = new Map();
        chunkTokens.forEach(t => tfMap.set(t, (tfMap.get(t) || 0) + 1));

        let bm25Score = 0;
        queryTokens.forEach(tok => {
          const tf = tfMap.get(tok) || 0;
          if (tf > 0) {
            const df = docFreq.get(tok) || 0;
            const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
            bm25Score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgdl)))) * 12;
          }
        });

        synonymTokens.forEach(tok => {
          const tf = tfMap.get(tok) || 0;
          if (tf > 0) {
            const df = docFreq.get(tok) || 0;
            const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
            bm25Score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgdl)))) * 5;
          }
        });

        let boost = 0;
        if (textLower.includes(queryLower)) boost += 50;
        queryTokens.forEach(t => {
          if (docNameLower.includes(t)) boost += 15;
        });

        return { ...chunk, score: Math.round(bm25Score + boost) };
      });

      const sorted = scored.filter(c => c.score > 0).sort((a, b) => b.score - a.score);
      const results = [];
      const docCount = new Map();
      const maxPerDoc = topK <= 4 ? 2 : 3;

      for (const c of sorted) {
        const count = docCount.get(c.documentId) || 0;
        if (count < maxPerDoc) {
          results.push(c);
          docCount.set(c.documentId, count + 1);
          if (results.length >= topK) break;
        }
      }

      if (results.length < topK) {
        for (const c of sorted) {
          if (!results.some(r => r.id === c.id)) {
            results.push(c);
            if (results.length >= topK) break;
          }
        }
      }

      return results;
    } catch (e) {
      console.error("[Search] Client fallback search failed:", e);
      return [];
    }
  }
}

window.CollegeSearch = new CollegeSearch();
