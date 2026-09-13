# Firebase Cloud Storage Schema

The College AI Assistant stores official college PDF handbooks, rulebooks, and circulars in Firebase Cloud Storage.

---

## Storage Bucket Directory Hierarchy

```
gs://<your-firebase-project-id>.appspot.com/
│
└── documents/
    ├── {documentId}/
    │   ├── Bonafide_Certificate_Procedure.pdf
    │   └── metadata.json
    │
    ├── doc-hostel-fees/
    │   └── Hostel_Fee_and_Rules_2025_26.pdf
    │
    └── doc-scholarship/
        └── Scholarship_Eligibility_Guidelines.pdf
```

---

## File Specifications & Constraints

| Parameter | Specification |
| :--- | :--- |
| **Accepted MIME Type** | `application/pdf` |
| **Maximum File Size** | 25 MB per document |
| **Read Permission** | Public read access so students can download verified source documents |
| **Write / Delete Permission** | Restricted to authenticated administrators via Firebase Auth rules |
| **Metadata Tagging** | `documentId`, `title`, `category`, `uploadedBy` stored in object metadata |

---

## Cloud Storage Trigger Workflow
1. Administrator uploads PDF through `/admin.html` or direct REST API.
2. The file is uploaded to `documents/{documentId}/{filename}`.
3. Firebase Storage triggers `extractText` Cloud Function or server parser.
4. Extracted text chunks with page numbers are stored in Cloud Firestore.
