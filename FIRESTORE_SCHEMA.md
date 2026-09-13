# Firestore Knowledge Base Schema

The College AI Assistant uses Google Cloud Firestore for storing structured document metadata, page-level text chunks, and retrieval indices.

---

## 1. Collection: `/documents/{documentId}`
Represents each uploaded official college PDF document.

### Document Fields
| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique document identifier (e.g. `doc_bonafide_2025`) |
| `title` | `string` | Human-readable document name (e.g. `Bonafide Certificate Procedure`) |
| `originalName` | `string` | Original file name (e.g. `Bonafide_Certificate_Procedure.pdf`) |
| `category` | `string` | Category: `Academic`, `Hostel`, `Fees`, `Examination`, `Scholarships`, `Placements` |
| `chunksCount` | `number` | Total number of extracted chunks indexed from this PDF |
| `fileSize` | `number` | File size in bytes |
| `storageUrl` | `string` | Cloud Storage download URL (`gs://...` or HTTPS link) |
| `uploadDate` | `timestamp` | Timestamp when document was processed and indexed |
| `uploadedBy` | `string` | Email of the administrator who uploaded the document |

---

## 2. Collection: `/chunks/{chunkId}` (or `/documents/{docId}/chunks/{chunkId}`)
Represents segmented, page-aware text passages used for retrieval and Gemini grounding.

### Chunk Fields
| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique chunk identifier (e.g. `chunk_bonafide_p1_0`) |
| `documentId` | `string` | Foreign key referencing parent document |
| `documentName` | `string` | Source PDF title cited in student responses |
| `category` | `string` | Classification category matching the parent document |
| `pageNumber` | `number` | Exact page number within the original PDF where chunk occurs |
| `chunkIndex` | `number` | Sequence index of the chunk within the document |
| `text` | `string` | Cleaned text extracted from the PDF page (~300-400 words) |
| `createdAt` | `timestamp` | Timestamp of chunk creation |

---

## 3. Collection: `/chatHistory/{sessionId}` (Optional Telemetry)
Records student interactions for quality assurance and verification audit trails.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `sessionId` | `string` | Unique student session identifier |
| `question` | `string` | Student question input |
| `answer` | `string` | Synthesized grounded answer |
| `sourceDocument` | `string` | Cited source document name |
| `pageNumber` | `string` | Cited page number |
| `confidence` | `number` | Grounding confidence score (0-100) |
| `timestamp` | `timestamp` | When query was processed |

---

## Security Rules Overview
- **Read**: Publicly readable by students without requiring authentication.
- **Write / Delete**: Restricted strictly to administrators authenticated via Firebase Authentication with `@college.edu` credentials or `admin` custom claim.
