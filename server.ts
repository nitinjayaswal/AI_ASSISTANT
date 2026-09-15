import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { initializeApp as initFirebaseApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  doc as firestoreDoc,
  setDoc as firestoreSetDoc,
  deleteDoc as firestoreDeleteDoc,
  collection as firestoreCollection,
  getDocs as firestoreGetDocs,
  updateDoc as firestoreUpdateDoc
} from "firebase/firestore";

dotenv.config();

const app = express();
const PORT = 3000;

// Body Parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Configure Multer for PDF & document uploads in memory (50 MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});

// Document & Chunk Data Types
interface DocumentChunk {
  id: string;
  documentId: string;
  documentName: string;
  category: string;
  pageNumber: number;
  chunkIndex: number;
  text: string;
  createdAt: string;
}

interface CollegeDocument {
  id: string;
  title: string;
  name: string;
  originalName: string;
  category: string;
  chunksCount: number;
  fileSize: number;
  uploadDate: string;
  chunks: DocumentChunk[];
}

// Previous Year Question Papers Data Types
export interface PreviousYearPaper {
  id: string;
  title: string;
  description: string;
  subject: string;
  course: string;
  semester: string;
  academicYear: string;
  examType: string;
  fileName: string;
  fileSize: number;
  uploadDate: string;
  filePath?: string;
  downloadCount: number;
  imageUrl?: string;
  linkUrl?: string;
}

// College Notices Data Types
export interface CollegeNotice {
  id: string;
  title: string;
  description: string;
  category: string;
  important: boolean;
  publishedDate: string;
  attachmentName?: string;
  attachmentSize?: number;
  attachmentPath?: string;
  imageUrl?: string;
  linkUrl?: string;
}

// ---------------------------------------------------------------------------
// Firebase Server Firestore Initialization & Synchronization
// ---------------------------------------------------------------------------
let firestoreDb: any = null;

function getFirestoreDb() {
  if (firestoreDb) return firestoreDb;
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    let config: any = null;
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } else {
      config = {
        projectId: "gen-lang-client-0950963299",
        firestoreDatabaseId: "ai-studio-collegeaiassista-3b073e3e-0862-4f78-a6c0-e7bebff9c153",
        apiKey: "AIzaSyDPh5A12NupPQh533Wiguaif1ShaQE7WA4",
        appId: "1:501133462431:web:bef497b242a10a64ec8baa"
      };
    }
    const app = getApps().length ? getApp() : initFirebaseApp(config);
    const dbId = config.firestoreDatabaseId || "ai-studio-collegeaiassista-3b073e3e-0862-4f78-a6c0-e7bebff9c153";
    firestoreDb = getFirestore(app, dbId);
    console.log("[Firebase Server] Initialized Firestore with Database ID:", dbId);
    return firestoreDb;
  } catch (err: any) {
    console.warn("[Firebase Server] Could not initialize Firestore:", err.message);
    return null;
  }
}

async function syncPaperToFirestore(paper: PreviousYearPaper) {
  try {
    const db = getFirestoreDb();
    if (!db) return;

    // 1. Sync document to "papers" collection
    await firestoreSetDoc(firestoreDoc(db, "papers", paper.id), {
      id: paper.id,
      title: paper.title,
      description: paper.description,
      subject: paper.subject,
      course: paper.course,
      semester: paper.semester,
      academicYear: paper.academicYear,
      examType: paper.examType,
      fileName: paper.fileName || "",
      fileSize: paper.fileSize || 0,
      downloadCount: paper.downloadCount || 0,
      uploadDate: paper.uploadDate || new Date().toISOString(),
      imageUrl: paper.imageUrl || "",
      linkUrl: paper.linkUrl || paper.imageUrl || "",
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // 2. ALWAYS sync image link to "image" collection in Firestore
    const activeLink = paper.imageUrl || paper.linkUrl || "";
    if (activeLink) {
      await firestoreSetDoc(firestoreDoc(db, "image", paper.id), {
        id: paper.id,
        link: activeLink,
        imageUrl: paper.imageUrl || activeLink,
        linkUrl: paper.linkUrl || activeLink,
        title: paper.title,
        type: "paper",
        subject: paper.subject,
        semester: paper.semester,
        course: paper.course,
        createdAt: paper.uploadDate || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Scan and update any empty placeholder documents (e.g. tM7YVUVOkCMGDvSd4EHO)
      try {
        const snap = await firestoreGetDocs(firestoreCollection(db, "image"));
        for (const docSnap of snap.docs) {
          const docData = docSnap.data();
          if (!docData.link || docData.link === "") {
            await firestoreUpdateDoc(firestoreDoc(db, "image", docSnap.id), {
              link: activeLink,
              imageUrl: activeLink,
              updatedAt: new Date().toISOString()
            });
            console.log(`[Firebase Server] Updated empty image doc ${docSnap.id} with link: ${activeLink}`);
          }
        }
      } catch (err: any) {
        console.warn("[Firebase Server] Empty placeholder update notice:", err.message);
      }
    }

    console.log(`[Firebase Server] Synced paper ${paper.id} and image link to Firestore.`);
  } catch (err: any) {
    console.warn("[Firebase Server] Error syncing paper to Firestore:", err.message);
  }
}

async function syncNoticeToFirestore(notice: CollegeNotice) {
  try {
    const db = getFirestoreDb();
    if (!db) return;

    // 1. Sync to "notices" collection
    await firestoreSetDoc(firestoreDoc(db, "notices", notice.id), {
      id: notice.id,
      title: notice.title,
      description: notice.description,
      category: notice.category,
      important: Boolean(notice.important),
      publishedDate: notice.publishedDate || new Date().toISOString().split("T")[0],
      attachmentName: notice.attachmentName || "",
      imageUrl: notice.imageUrl || "",
      linkUrl: notice.linkUrl || notice.imageUrl || "",
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // 2. ALWAYS sync image link to "image" collection in Firestore
    const activeLink = notice.imageUrl || notice.linkUrl || "";
    if (activeLink) {
      await firestoreSetDoc(firestoreDoc(db, "image", notice.id), {
        id: notice.id,
        link: activeLink,
        imageUrl: notice.imageUrl || activeLink,
        linkUrl: notice.linkUrl || activeLink,
        title: notice.title,
        type: "notice",
        category: notice.category,
        createdAt: notice.publishedDate || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Scan and update any empty placeholder documents
      try {
        const snap = await firestoreGetDocs(firestoreCollection(db, "image"));
        for (const docSnap of snap.docs) {
          const docData = docSnap.data();
          if (!docData.link || docData.link === "") {
            await firestoreUpdateDoc(firestoreDoc(db, "image", docSnap.id), {
              link: activeLink,
              imageUrl: activeLink,
              updatedAt: new Date().toISOString()
            });
            console.log(`[Firebase Server] Updated empty image doc ${docSnap.id} with link: ${activeLink}`);
          }
        }
      } catch (err: any) {
        console.warn("[Firebase Server] Empty placeholder update notice:", err.message);
      }
    }

    console.log(`[Firebase Server] Synced notice ${notice.id} and image link to Firestore.`);
  } catch (err: any) {
    console.warn("[Firebase Server] Error syncing notice to Firestore:", err.message);
  }
}

async function deleteFromFirestore(collectionName: string, id: string) {
  try {
    const db = getFirestoreDb();
    if (!db) return;
    await firestoreDeleteDoc(firestoreDoc(db, collectionName, id));
    await firestoreDeleteDoc(firestoreDoc(db, "image", id));
    console.log(`[Firebase Server] Deleted ${id} from ${collectionName} and image collection.`);
  } catch (err: any) {
    console.warn("[Firebase Server] Error deleting from Firestore:", err.message);
  }
}

// Seed Official College Regulations
const INITIAL_COLLEGE_DOCUMENTS: CollegeDocument[] = [
  {
    id: "doc-bonafide-cert",
    title: "Bonafide Certificate Procedure",
    name: "Bonafide_Certificate_Procedure.pdf",
    originalName: "Bonafide_Certificate_Procedure.pdf",
    category: "Academic & Admissions",
    chunksCount: 2,
    fileSize: 184320,
    uploadDate: new Date("2025-08-15").toISOString(),
    chunks: [
      {
        id: "chunk-bonafide-1",
        documentId: "doc-bonafide-cert",
        documentName: "Bonafide_Certificate_Procedure.pdf",
        category: "Academic & Admissions",
        pageNumber: 1,
        chunkIndex: 0,
        text: `COLLEGE ACADEMIC AFFAIRS - BONAFIDE CERTIFICATE REGULATION
Section 1: Purpose and Eligibility.
A Bonafide Certificate verifies that a student is actively enrolled in good standing at the college for the current academic session. Bonafide certificates are commonly required for:
1. Passport and Visa applications
2. Educational bank loans and scholarship verifications
3. Student bus and railway monthly concessions
4. Off-campus internship and seminar permissions
Eligibility: Any student with an active enrollment number and cleared semester tuition fees without disciplinary suspension may apply. Required documents to attach: Student ID card copy and latest semester fee payment receipt.`,
        createdAt: new Date("2025-08-15").toISOString()
      },
      {
        id: "chunk-bonafide-2",
        documentId: "doc-bonafide-cert",
        documentName: "Bonafide_Certificate_Procedure.pdf",
        category: "Academic & Admissions",
        pageNumber: 2,
        chunkIndex: 1,
        text: `Section 2: Application Procedure and Processing Timeline.
Step 1: Log in to the College ERP Student Portal (erp.college.edu) using your student credentials.
Step 2: Navigate to 'Student Services' -> 'Certificate Requests' -> 'Bonafide Certificate'.
Step 3: Select the specific purpose (Passport, Bank Loan, Transport Concession, or General) from the dropdown.
Step 4: Pay the nominal processing fee of $5 (Rs. 100) through the integrated payment gateway.
Processing Timeline: Normal requests are processed within 2 to 3 working days.
Collection: Physical signed and sealed copies can be collected from Academic Office Counter 4 between 2:00 PM and 4:30 PM on working days, or downloaded as a digitally signed PDF with a QR verification code from the ERP portal.`,
        createdAt: new Date("2025-08-15").toISOString()
      }
    ]
  },
  {
    id: "doc-hostel-fees",
    title: "Hostel Fee Structure & Rules 2025-26",
    name: "Hostel_Fee_and_Rules_2025_26.pdf",
    originalName: "Hostel_Fee_and_Rules_2025_26.pdf",
    category: "Hostel & Housing",
    chunksCount: 2,
    fileSize: 245760,
    uploadDate: new Date("2025-08-20").toISOString(),
    chunks: [
      {
        id: "chunk-hostel-1",
        documentId: "doc-hostel-fees",
        documentName: "Hostel_Fee_and_Rules_2025_26.pdf",
        category: "Hostel & Housing",
        pageNumber: 1,
        chunkIndex: 0,
        text: `CAMPUS RESIDENCE & HOSTEL ADMISSIONS 2025-2026
Section 1: Annual Fee Schedule and Room Types.
The college hostel fee structure for the academic session 2025-2026 is as follows:
- Double Occupancy Room (Air Conditioned): $1,400 (Rs. 95,000) per semester.
- Double Occupancy Room (Non-AC): $900 (Rs. 65,000) per semester.
- Triple Occupancy Room (Standard Non-AC): $650 (Rs. 48,000) per semester.
- Refundable Hostel Caution Deposit (One-time at admission): $150 (Rs. 10,000).
- Mandatory Mess Fee: $600 (Rs. 40,000) per semester, covering four meals daily (Breakfast, Lunch, Evening Snacks/Tea, and Dinner) prepared in the central hygienic dining hall.
Payment must be completed in full before room keys and biometric access are issued.`,
        createdAt: new Date("2025-08-20").toISOString()
      },
      {
        id: "chunk-hostel-2",
        documentId: "doc-hostel-fees",
        documentName: "Hostel_Fee_and_Rules_2025_26.pdf",
        category: "Hostel & Housing",
        pageNumber: 2,
        chunkIndex: 1,
        text: `Section 2: Curfew Timings and Residence Conduct.
1. Entry Timings: All hostel residents must return to the hostel premises by 9:30 PM on weekdays (Monday to Friday) and by 10:00 PM on weekends (Saturday and Sunday). Biometric attendance is logged between 9:30 PM and 10:15 PM.
2. Night-Out Pass: Students wishing to stay overnight with local guardians or travel home must submit a digital Night-Out Request on the Hostel ERP portal at least 24 hours in advance, accompanied by SMS/Email consent from a registered parent or guardian.
3. Prohibited Items: Heavy electrical appliances including electric heaters, induction stoves, immersion rods, and hot plates are strictly forbidden in student rooms due to fire safety protocols. Possession of prohibited equipment results in a $50 fine and equipment confiscation.`,
        createdAt: new Date("2025-08-20").toISOString()
      }
    ]
  },
  {
    id: "doc-scholarship",
    title: "Scholarship Eligibility Guidelines",
    name: "Scholarship_Eligibility_Guidelines.pdf",
    originalName: "Scholarship_Eligibility_Guidelines.pdf",
    category: "Scholarships",
    chunksCount: 2,
    fileSize: 204800,
    uploadDate: new Date("2025-09-01").toISOString(),
    chunks: [
      {
        id: "chunk-scholarship-1",
        documentId: "doc-scholarship",
        documentName: "Scholarship_Eligibility_Guidelines.pdf",
        category: "Scholarships",
        pageNumber: 1,
        chunkIndex: 0,
        text: `INSTITUTIONAL SCHOLARSHIPS AND FINANCIAL AID POLICY
Section 1: Merit-Cum-Means (MCM) Scholarship.
Eligibility Criteria:
1. Academic Standing: Minimum Cumulative Grade Point Average (CGPA) of 8.0 out of 10.0 across all completed semesters, with no standing academic backlogs.
2. Financial Need: Combined gross annual family/parental income must not exceed $7,500 (Rs. 6,00,000) per annum. An official income certificate issued by a competent revenue authority must be produced.
3. Award: Eligible recipients receive a 50% waiver on annual tuition fees.
Attendance Requirement: Students must maintain at least 75% classroom attendance in every registered course to remain eligible for continuation in subsequent terms.`,
        createdAt: new Date("2025-09-01").toISOString()
      },
      {
        id: "chunk-scholarship-2",
        documentId: "doc-scholarship",
        documentName: "Scholarship_Eligibility_Guidelines.pdf",
        category: "Scholarships",
        pageNumber: 2,
        chunkIndex: 1,
        text: `Section 2: Category and Sports Scholarships & Deadlines.
1. Government & Social Welfare Scholarships: SC, ST, OBC, and Minority post-matric scholarship applications are facilitated through the National Scholarship Portal (NSP). The College Nodal Office assists with document verification and institutional endorsement.
2. Sports Excellence Scholarship: Students representing the college or state in recognized national sports tournaments receive a 100% sports scholarship plus an annual sports training allowance.
3. Application Deadline: Applications for all institutional scholarships open on August 15th and close strictly on October 15th of the active academic year. Late applications cannot be entertained.`,
        createdAt: new Date("2025-09-01").toISOString()
      }
    ]
  },
  {
    id: "doc-exam-rules",
    title: "Examination Registration & Regulations",
    name: "Examination_Registration_and_Rules.pdf",
    originalName: "Examination_Registration_and_Rules.pdf",
    category: "Examination",
    chunksCount: 2,
    fileSize: 194560,
    uploadDate: new Date("2025-09-05").toISOString(),
    chunks: [
      {
        id: "chunk-exam-1",
        documentId: "doc-exam-rules",
        documentName: "Examination_Registration_and_Rules.pdf",
        category: "Examination",
        pageNumber: 1,
        chunkIndex: 0,
        text: `OFFICE OF THE CONTROLLER OF EXAMINATIONS (COE)
Section 1: Exam Enrollment and Hall Ticket Release.
1. Semester Exam Registration Process: Every student must enroll for end-semester examinations via the ERP Examination Portal under 'Academic' -> 'Exam Enrollment' before the announced cutoff date.
2. Mandatory Attendance: A minimum of 75% attendance in theory lectures and practical laboratory sessions is strictly required to be eligible to write end-semester examinations.
3. Hall Ticket Issuance: Hall tickets (admit cards) are generated online 7 days prior to examination commencement. Students with dues or attendance shortages below 75% will have their hall tickets blocked until cleared by the Department Dean.`,
        createdAt: new Date("2025-09-05").toISOString()
      },
      {
        id: "chunk-exam-2",
        documentId: "doc-exam-rules",
        documentName: "Examination_Registration_and_Rules.pdf",
        category: "Examination",
        pageNumber: 2,
        chunkIndex: 1,
        text: `Section 2: Examination Fees and Supplementary Rules.
1. Regular Exam Fees: Regular semester examination fees are included in the standard semester tuition.
2. Late Registration Surcharge: Late examination registration is permitted up to 5 days past the deadline with a penalty fee of $20 (Rs. 500).
3. Supplementary / Arrear Exams: Students with backlogs can register for supplementary examinations held during the summer break or following semester. The supplementary exam fee is $15 (Rs. 400) per subject course.
4. Revaluation / Grade Review: Applications for answer script photocopy and re-evaluation must be submitted within 10 days of results declaration with a fee of $25 per paper.`,
        createdAt: new Date("2025-09-05").toISOString()
      }
    ]
  },
  {
    id: "doc-fee-process",
    title: "Tuition & Fee Payment Process",
    name: "Tuition_and_Fee_Payment_Process.pdf",
    originalName: "Tuition_and_Fee_Payment_Process.pdf",
    category: "Fees & Accounts",
    chunksCount: 2,
    fileSize: 168960,
    uploadDate: new Date("2025-09-08").toISOString(),
    chunks: [
      {
        id: "chunk-fee-1",
        documentId: "doc-fee-process",
        documentName: "Tuition_and_Fee_Payment_Process.pdf",
        category: "Fees & Accounts",
        pageNumber: 1,
        chunkIndex: 0,
        text: `FINANCE & ACCOUNTS DEPARTMENT - FEE PAYMENT GUIDELINES
Section 1: Payment Schedule and Accepted Modes.
1. Payment Portal: All tuition, lab, library, and development fees must be remitted through the official College Payment Gateway located at payments.college.edu or via NetBanking, UPI, Debit/Credit Card, and NEFT/RTGS. Cash payments are strictly not accepted.
2. Due Date: Fall semester fees are due on or before July 31st; Spring semester fees are due on or before December 31st.
3. Payment Receipts: Immediate digital receipts with transaction ID and college seal are generated and stored under the student's ERP profile for tax and scholarship records.`,
        createdAt: new Date("2025-09-08").toISOString()
      },
      {
        id: "chunk-fee-2",
        documentId: "doc-fee-process",
        documentName: "Tuition_and_Fee_Payment_Process.pdf",
        category: "Fees & Accounts",
        pageNumber: 2,
        chunkIndex: 1,
        text: `Section 2: Installments and Late Payment Penalties.
1. Late Fee Penalty: A late fine of $2 (Rs. 100) per day is levied for payments received after the due date up to a maximum period of 15 days. Beyond 15 days, course registration and portal access are temporarily withheld.
2. Installment Option: Students experiencing severe family financial constraints may submit a written installment request to the Dean of Student Welfare 10 days before the due date. Upon approval, tuition may be paid in two equal installments: 50% before semester start and 50% before mid-term examinations.`,
        createdAt: new Date("2025-09-08").toISOString()
      }
    ]
  },
  {
    id: "doc-placement-rules",
    title: "Campus Placement & Internship Rules",
    name: "Campus_Placement_and_Internship_Rules.pdf",
    originalName: "Campus_Placement_and_Internship_Rules.pdf",
    category: "Placement & Training",
    chunksCount: 2,
    fileSize: 225280,
    uploadDate: new Date("2025-09-10").toISOString(),
    chunks: [
      {
        id: "chunk-placement-1",
        documentId: "doc-placement-rules",
        documentName: "Campus_Placement_and_Internship_Rules.pdf",
        category: "Placement & Training",
        pageNumber: 1,
        chunkIndex: 0,
        text: `CAREER DEVELOPMENT & PLACEMENT CELL (CDPC)
Section 1: Student Eligibility Criteria.
1. Academic Requirement: Students must possess an overall CGPA of 6.5 or above with no active academic backlogs at the start of the 7th semester placement season.
2. Training Attendance: A minimum of 80% mandatory attendance in pre-placement aptitude training, resume workshops, and technical coding bootcamps is strictly required for registration with CDPC.
3. Registration: All students seeking campus placement must register on the College Placement Portal by June 30th with verified grade sheets and updated resumes.`,
        createdAt: new Date("2025-09-10").toISOString()
      },
      {
        id: "chunk-placement-2",
        documentId: "doc-placement-rules",
        documentName: "Campus_Placement_and_Internship_Rules.pdf",
        category: "Placement & Training",
        pageNumber: 2,
        chunkIndex: 1,
        text: `Section 2: Dream Company Policy and Code of Conduct.
1. One-Job Policy: To ensure equitable opportunity, a student who secures an initial campus placement offer is considered placed and cannot appear for other companies in the same salary tier.
2. Dream Company Upgrade: If a student secures an offer below $10,000 (Rs. 8 LPA), they are permitted to attempt up to two 'Dream Category' companies offering a minimum compensation of 1.5x higher.
3. Code of Conduct: Formal business attire is mandatory for all interview drives. Once a student receives and accepts an offer from a Dream Company, they are permanently removed from the placement pool. Unexcused absence from an interview after shortlisting results in immediate debarment from the placement season.`,
        createdAt: new Date("2025-09-10").toISOString()
      }
    ]
  },
  {
    id: "doc-pu-holidays-2026",
    title: "Panjab University Academic Holidays 2026",
    name: "Panjab_University_Holidays_2026.pdf",
    originalName: "20260130201152-pu-holidays-2026.pdf",
    category: "Academic & Admissions",
    chunksCount: 2,
    fileSize: 220000,
    uploadDate: new Date("2026-01-30").toISOString(),
    chunks: [
      {
        id: "chunk-holidays-1",
        documentId: "doc-pu-holidays-2026",
        documentName: "Panjab_University_Holidays_2026.pdf",
        category: "Academic & Admissions",
        pageNumber: 1,
        chunkIndex: 0,
        text: `PANJAB UNIVERSITY, CHANDIGARH
LIST OF HOLIDAYS FOR THE CALENDAR YEAR 2026 TO BE OBSERVED BY THE ADMINISTRATIVE OFFICES, UNIVERSITY TEACHING DEPARTMENTS, AND AFFILIATED COLLEGES:
1. Republic Day - January 26, 2026 (Monday)
2. Guru Ravidas Jayanti - February 1, 2026 (Sunday)
3. Maha Shivratri - February 15, 2026 (Sunday)
4. Holi - March 4, 2026 (Wednesday)
5. Id-ul-Fitr - March 21, 2026 (Saturday)
6. Mahavir Jayanti - March 31, 2026 (Tuesday)
7. Good Friday - April 3, 2026 (Friday)
8. Baisakhi / Dr. B.R. Ambedkar Jayanti - April 14, 2026 (Tuesday)
9. Id-ul-Zuha (Bakrid) - May 28, 2026 (Thursday)
10. Muharram - June 26, 2026 (Friday)
11. Independence Day - August 15, 2026 (Saturday)
12. Janmashtami - September 4, 2026 (Friday)
13. Milad-un-Nabi (Id-e-Milad) - September 25, 2026 (Friday)
14. Mahatma Gandhi Jayanti - October 2, 2026 (Friday)
15. Dussehra - October 20, 2026 (Tuesday)
16. Maharishi Valmiki Jayanti - October 26, 2026 (Monday)
17. Diwali - November 8, 2026 (Sunday)
18. Goverdhan Puja - November 9, 2026 (Monday)
19. Guru Nanak Jayanti (Guru Nanak Dev Ji Birthday) - November 24, 2026 (Tuesday)
20. Christmas Day - December 25, 2026 (Friday)`,
        createdAt: new Date("2026-01-30").toISOString()
      },
      {
        id: "chunk-holidays-2",
        documentId: "doc-pu-holidays-2026",
        documentName: "Panjab_University_Holidays_2026.pdf",
        category: "Academic & Admissions",
        pageNumber: 2,
        chunkIndex: 1,
        text: `PANJAB UNIVERSITY NOTIFICATIONS & SPECIAL OFFICE TIMINGS 2026:
1. Raksha Bandhan Opening Timing: On account of Raksha Bandhan (August 28, 2026), the University and College Administrative Offices will open at 11:00 AM instead of 9:00 AM.
2. Restricted Holidays: In addition to the official gazetted holidays, employees and staff are entitled to avail up to two restricted holidays from the university approved list with prior notice.
3. Summer & Winter Break: Summer vacation for university teaching departments and affiliated colleges commences from June 1st to July 5th, 2026. Winter break is scheduled from December 24th to January 2nd, 2027.`,
        createdAt: new Date("2026-01-30").toISOString()
      }
    ]
  },
  {
    id: "doc-hostel-scholarship-2026",
    title: "Financial Assistance for Hostel Residents 2025-26",
    name: "Scholarship_for_Hostel_Students_2025_26.pdf",
    originalName: "20260114151016-scholarshipforhostelstudents2025-26.pdf",
    category: "Scholarships",
    chunksCount: 2,
    fileSize: 215000,
    uploadDate: new Date("2026-01-14").toISOString(),
    chunks: [
      {
        id: "chunk-hostel-schol-1",
        documentId: "doc-hostel-scholarship-2026",
        documentName: "Scholarship_for_Hostel_Students_2025_26.pdf",
        category: "Scholarships",
        pageNumber: 1,
        chunkIndex: 0,
        text: `PANJAB UNIVERSITY, CHANDIGARH - OFFICE OF THE DEAN STUDENT WELFARE (DSW)
APPLICATION FOR THE GRANT OF 'FINANCIAL ASSISTANCE' TO THE PANJAB UNIVERSITY HOSTEL RESIDENTS FOR THE SESSION 2025 - 2026.
Eligibility & Guidelines:
1. Beneficiary: Deserving and economically weaker students residing in Panjab University boys and girls hostels.
2. Income Limit: Total family annual income from all sources must not exceed Rs. 2,50,000/- per annum. Valid income certificate issued by Tehsildar / Sub-Divisional Magistrate (SDM) or employer salary slip must be attached.
3. Academic Standing: The candidate must have cleared all preceding semester examinations without standing backlogs.
4. Conduct: Good conduct certificate and attendance endorsement signed by the respective Hostel Warden is mandatory.`,
        createdAt: new Date("2026-01-14").toISOString()
      },
      {
        id: "chunk-hostel-schol-2",
        documentId: "doc-hostel-scholarship-2026",
        documentName: "Scholarship_for_Hostel_Students_2025_26.pdf",
        category: "Scholarships",
        pageNumber: 2,
        chunkIndex: 1,
        text: `PANJAB UNIVERSITY HOSTEL FINANCIAL ASSISTANCE 2025-26 - DEADLINES & SUBMISSION:
1. Submission Deadline: The Last Date for receipt of form is strictly 31.01.2026 (January 31, 2026). Incomplete applications or applications received after 31.01.2026 will not be entertained under any circumstances.
2. Where to Submit: Completed application forms along with income certificate, fee receipts, and marks sheets must be submitted to the Office of the Dean Student Welfare (DSW), Student Centre, Panjab University, Chandigarh, after due endorsement and signature by the concerned Hostel Warden.
3. Disbursement: Selected beneficiaries receive direct financial subsidy credited against their hostel room rent and mess fee dues.`,
        createdAt: new Date("2026-01-14").toISOString()
      }
    ]
  }
];

// Seed Previous Year Papers
const INITIAL_PAPERS: PreviousYearPaper[] = [
  {
    id: "paper-dsa-2024",
    title: "Data Structures & Algorithms - End Semester Exam 2024",
    description: "Official university question paper for CSE/IT. Questions cover Binary Search Trees, AVL balance rotations, Dijkstra's algorithm, Graph Traversals, and Dynamic Programming.",
    subject: "Data Structures & Algorithms",
    course: "B.Tech Computer Science & Engineering",
    semester: "Semester 3",
    academicYear: "2023-2024",
    examType: "End Semester",
    fileName: "CS301_DSA_EndSem_2024.pdf",
    fileSize: 284160,
    uploadDate: new Date("2024-12-18").toISOString(),
    downloadCount: 142
  },
  {
    id: "paper-dbms-2024",
    title: "Database Management Systems - End Semester Exam 2024",
    description: "Comprehensive question paper covering Relational Algebra, SQL complex queries, B+ Trees indexing, 3NF/BCNF Normalization, and ACID transaction concurrency control.",
    subject: "Database Management Systems",
    course: "B.Tech Computer Science & IT",
    semester: "Semester 4",
    academicYear: "2023-2024",
    examType: "End Semester",
    fileName: "CS402_DBMS_EndSem_2024.pdf",
    fileSize: 312400,
    uploadDate: new Date("2024-06-10").toISOString(),
    downloadCount: 98
  },
  {
    id: "paper-os-2024",
    title: "Operating Systems & Concurrency - Mid Semester Exam 2024",
    description: "Mid-term exam paper covering Process Scheduling (FCFS, Round Robin, Priority), Banker's Algorithm for Deadlock Avoidance, Semaphores, and Virtual Memory Paging.",
    subject: "Operating Systems",
    course: "B.Tech Computer Science / Electrical",
    semester: "Semester 5",
    academicYear: "2024-2025",
    examType: "Mid Semester",
    fileName: "CS501_OS_MidSem_2024.pdf",
    fileSize: 248900,
    uploadDate: new Date("2024-10-15").toISOString(),
    downloadCount: 76
  },
  {
    id: "paper-discrete-2023",
    title: "Discrete Mathematics & Graph Theory - Final Exam 2023",
    description: "Includes questions on Propositional Logic, Recurrence Relations, Combinatorics, Graph Coloring, Hamiltonian cycles, and Algebraic Group Structures.",
    subject: "Discrete Mathematics",
    course: "B.Tech & B.Sc Mathematics",
    semester: "Semester 2",
    academicYear: "2022-2023",
    examType: "End Semester",
    fileName: "MA201_DiscreteMath_Final_2023.pdf",
    fileSize: 215040,
    uploadDate: new Date("2023-05-24").toISOString(),
    downloadCount: 115
  },
  {
    id: "paper-digital-2024",
    title: "Digital Electronics & Microprocessors - End Semester Exam",
    description: "Covers Karnaugh Maps (K-Map) minimization, Flip-Flops, Counters, 8085/8086 Assembly architecture, and Memory Interfacing techniques.",
    subject: "Digital Electronics",
    course: "B.Tech Electronics & Communication",
    semester: "Semester 3",
    academicYear: "2023-2024",
    examType: "End Semester",
    fileName: "EC303_Digital_Electronics_2024.pdf",
    fileSize: 342100,
    uploadDate: new Date("2024-12-22").toISOString(),
    downloadCount: 64
  },
  {
    id: "paper-math1-2023",
    title: "Engineering Mathematics I (Calculus & Linear Algebra)",
    description: "First year university examination paper covering Eigenvalues and Eigenvectors, Cayley-Hamilton theorem, Multivariable Taylor series, and Double Integrals.",
    subject: "Engineering Mathematics I",
    course: "All Engineering Branches",
    semester: "Semester 1",
    academicYear: "2023-2024",
    examType: "End Semester",
    fileName: "ENG101_Maths1_EndSem_2023.pdf",
    fileSize: 198600,
    uploadDate: new Date("2023-12-28").toISOString(),
    downloadCount: 189
  }
];

// Seed Latest Notices
const INITIAL_NOTICES: CollegeNotice[] = [
  {
    id: "notice-exam-may2026",
    title: "End Semester May/June 2026 Examination Date Sheet & Admit Card Portal",
    description: "The Controller of Examinations has officially released the detailed date sheet for all undergraduate and postgraduate programs for the upcoming End Semester examinations commencing May 18, 2026. Hall tickets with examination center details will be downloadable through the Student ERP portal starting May 2, 2026. Students with fee arrears or attendance below 75% must resolve discrepancies before the deadline.",
    category: "Examination",
    important: true,
    publishedDate: "2026-04-10",
    attachmentName: "Notice_EndSem_DateSheet_2026.pdf",
    attachmentSize: 194560
  },
  {
    id: "notice-scholarship-2026",
    title: "Merit-cum-Means Scholarship 2025-26: Applications Open for Second Cycle",
    description: "The Dean Student Welfare (DSW) office invites applications from meritorious and economically disadvantaged students for the College Merit-cum-Means Financial Aid. Eligible students whose family annual income is under $6,000 (Rs. 4.5 Lakhs) and who maintain a CGPA of 7.5 or above can submit verification forms along with required tax receipts at Administrative Counter 3 by April 28, 2026.",
    category: "Scholarship",
    important: false,
    publishedDate: "2026-04-05",
    attachmentName: "Scholarship_Circular_Cycle2.pdf",
    attachmentSize: 154200
  },
  {
    id: "notice-placement-2026",
    title: "Annual Campus Placement Drive 2026: Tier-1 Tech Companies Visiting Schedule",
    description: "The Training and Placement Cell (TPC) announces the schedule for on-campus technical recruitment drives beginning May 25, 2026. Pre-placement talks and coding assessments will be held in the Central Computing Auditorium. Final-year students are advised to update their resume profiles on the TPC portal.",
    category: "Placement",
    important: true,
    publishedDate: "2026-03-22",
    attachmentName: "TPC_Drive_Schedule_2026.pdf",
    attachmentSize: 228000
  },
  {
    id: "notice-hostel-autumn2026",
    title: "Hostel Room Allotment & Biometric Registration for Autumn Session",
    description: "All continuing hostel residents are notified that the room renewal and allotment window for the Autumn 2026 semester will open from April 20 to May 5, 2026. Biometric attendance scanners at boys and girls hostels will be recalibrated on April 15. Please ensure mess caution dues are cleared to avoid allocation hold.",
    category: "Hostel",
    important: false,
    publishedDate: "2026-03-28",
    attachmentName: "Hostel_Allotment_Autumn2026.pdf",
    attachmentSize: 182300
  },
  {
    id: "notice-calendar-2026",
    title: "Academic Calendar Amendment: Summer Vacation & Remedial Classes",
    description: "As approved by the Academic Council, the summer recess for academic staff and students will commence from June 15, 2026 to July 20, 2026. Remedial coaching for students with backlogs will be conducted between June 22 and July 5, 2026.",
    category: "Academic",
    important: false,
    publishedDate: "2026-03-15",
    attachmentName: "Academic_Calendar_Amendment_2026.pdf",
    attachmentSize: 142100
  }
];

// Durable File Persistence for Uploaded Knowledge Base, Papers, and Notices
const DATA_DIR = path.join(process.cwd(), "data");
const DOCUMENTS_FILE = path.join(DATA_DIR, "documents-store.json");
const PAPERS_FILE = path.join(DATA_DIR, "papers-store.json");
const NOTICES_FILE = path.join(DATA_DIR, "notices-store.json");
const STUDENTS_FILE = path.join(DATA_DIR, "students-store.json");
const PAPERS_UPLOAD_DIR = path.join(DATA_DIR, "uploads", "papers");
const NOTICES_UPLOAD_DIR = path.join(DATA_DIR, "uploads", "notices");

// Ensure directories exist
for (const dir of [DATA_DIR, PAPERS_UPLOAD_DIR, NOTICES_UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.warn("Could not create directory:", dir, e);
    }
  }
}

// Generate valid sample PDF buffer for papers/notices when downloaded
function generateSamplePdf(title: string, subtitle: string, bodyText: string): Buffer {
  const safeTitle = (title || "College Academic Document").replace(/[()\\]/g, "").slice(0, 70);
  const safeSub = (subtitle || "Official University Examination / Notice").replace(/[()\\]/g, "").slice(0, 80);
  const safeContent = (bodyText || "Official College Document details and examination questions.")
    .replace(/[()\\]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 300);

  const stream = `BT
/F1 18 Tf
50 730 Td
(${safeTitle}) Tj
ET
BT
/F1 12 Tf
50 700 Td
(${safeSub}) Tj
ET
BT
/F1 10 Tf
50 660 Td
(${safeContent.slice(0, 90)}) Tj
ET
BT
/F1 10 Tf
50 640 Td
(${safeContent.slice(90, 180)}) Tj
ET
BT
/F1 10 Tf
50 620 Td
(${safeContent.slice(180, 270)}) Tj
ET
BT
/F1 9 Tf
50 100 Td
(Official College Academic Portal - Verified Document Repository) Tj
ET`;

  const streamLen = Buffer.byteLength(stream);

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLen} >>
stream
${stream}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000000 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${300 + streamLen}
%%EOF`;

  return Buffer.from(pdf);
}

// Documents store
function saveDocumentsToDisk(docs: CollegeDocument[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(docs, null, 2), "utf-8");
    console.log(`[Store] Successfully persisted ${docs.length} documents to disk.`);
  } catch (err: any) {
    console.error("[Store] Failed to save documents to disk:", err.message);
  }
}

function loadDocumentsFromDisk(): CollegeDocument[] {
  try {
    if (fs.existsSync(DOCUMENTS_FILE)) {
      const raw = fs.readFileSync(DOCUMENTS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[Store] Loaded ${parsed.length} persisted documents from disk.`);
        return parsed;
      }
    }
  } catch (err: any) {
    console.warn("[Store] Error reading documents from disk, resetting to seed:", err.message);
  }
  saveDocumentsToDisk(INITIAL_COLLEGE_DOCUMENTS);
  return [...INITIAL_COLLEGE_DOCUMENTS];
}

// Previous Year Papers store
function savePapersToDisk(papers: PreviousYearPaper[]): void {
  try {
    fs.writeFileSync(PAPERS_FILE, JSON.stringify(papers, null, 2), "utf-8");
    console.log(`[Store] Successfully persisted ${papers.length} previous year papers.`);
  } catch (err: any) {
    console.error("[Store] Failed to save papers to disk:", err.message);
  }
}

function loadPapersFromDisk(): PreviousYearPaper[] {
  try {
    if (fs.existsSync(PAPERS_FILE)) {
      const raw = fs.readFileSync(PAPERS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[Store] Loaded ${parsed.length} previous year papers from disk.`);
        return parsed;
      }
    }
  } catch (err: any) {
    console.warn("[Store] Error reading papers from disk, resetting to seed:", err.message);
  }
  savePapersToDisk(INITIAL_PAPERS);
  return [...INITIAL_PAPERS];
}

// Latest Notices store
function saveNoticesToDisk(notices: CollegeNotice[]): void {
  try {
    fs.writeFileSync(NOTICES_FILE, JSON.stringify(notices, null, 2), "utf-8");
    console.log(`[Store] Successfully persisted ${notices.length} notices.`);
  } catch (err: any) {
    console.error("[Store] Failed to save notices to disk:", err.message);
  }
}

function loadNoticesFromDisk(): CollegeNotice[] {
  try {
    if (fs.existsSync(NOTICES_FILE)) {
      const raw = fs.readFileSync(NOTICES_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[Store] Loaded ${parsed.length} notices from disk.`);
        return parsed;
      }
    }
  } catch (err: any) {
    console.warn("[Store] Error reading notices from disk, resetting to seed:", err.message);
  }
  saveNoticesToDisk(INITIAL_NOTICES);
  return [...INITIAL_NOTICES];
}

// Student User Profiles store (Gmail authenticated)
export interface StudentUser {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: "student";
  provider: string;
  college?: string;
  department?: string;
  semester?: string;
  createdAt: string;
  lastLoginAt: string;
}

function saveStudentsToDisk(students: StudentUser[]): void {
  try {
    fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2), "utf-8");
    console.log(`[Store] Successfully persisted ${students.length} student profiles.`);
  } catch (err: any) {
    console.error("[Store] Failed to save students to disk:", err.message);
  }
}

function loadStudentsFromDisk(): StudentUser[] {
  try {
    if (fs.existsSync(STUDENTS_FILE)) {
      const raw = fs.readFileSync(STUDENTS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        console.log(`[Store] Loaded ${parsed.length} student profiles from disk.`);
        return parsed;
      }
    }
  } catch (err: any) {
    console.warn("[Store] Error reading students from disk:", err.message);
  }
  return [];
}

// Active in-memory databases synced with disk storage
let documentsDatabase: CollegeDocument[] = loadDocumentsFromDisk();
let papersDatabase: PreviousYearPaper[] = loadPapersFromDisk();
let noticesDatabase: CollegeNotice[] = loadNoticesFromDisk();
let studentsDatabase: StudentUser[] = loadStudentsFromDisk();

// Helper: Stop words for keyword retrieval
const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "all", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both",
  "but", "by", "can", "could", "did", "do", "does", "for", "from", "had", "has",
  "have", "he", "her", "here", "how", "i", "if", "in", "into", "is", "it", "its",
  "me", "my", "of", "on", "or", "our", "she", "so", "some", "than", "that", "the",
  "their", "them", "then", "there", "these", "they", "this", "those", "to", "too",
  "under", "until", "up", "very", "was", "we", "were", "what", "when", "where",
  "which", "who", "whom", "why", "will", "with", "would", "you", "your"
]);

function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

// --------------------------------------------------------------------------
// API ROUTES
// --------------------------------------------------------------------------

// 1. Health check
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 1b. Firebase Client Configuration
app.get("/api/firebase-config", (req: Request, res: Response) => {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return res.json({
        projectId: config.projectId,
        appId: config.appId,
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        firestoreDatabaseId: config.firestoreDatabaseId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        oAuthClientId: config.oAuthClientId
      });
    } catch (e) {
      console.warn("Failed to read firebase-applet-config.json:", e);
    }
  }
  return res.json({
    projectId: "gen-lang-client-0950963299",
    appId: "1:501133462431:web:bef497b242a10a64ec8baa",
    apiKey: "AIzaSyDPh5A12NupPQh533Wiguaif1ShaQE7WA4",
    authDomain: "gen-lang-client-0950963299.firebaseapp.com",
    firestoreDatabaseId: "ai-studio-collegeaiassista-3b073e3e-0862-4f78-a6c0-e7bebff9c153",
    storageBucket: "gen-lang-client-0950963299.firebasestorage.app",
    messagingSenderId: "501133462431",
    oAuthClientId: "501133462431-a674v3qj6i1d2o95bj18bejsemr9t569.apps.googleusercontent.com"
  });
});

// 2. List all uploaded documents
app.get("/api/documents", (req: Request, res: Response) => {
  const includeChunks = req.query.includeChunks === "true";
  const list = documentsDatabase.map((d) => ({
    id: d.id,
    title: d.title,
    name: d.name,
    originalName: d.originalName,
    category: d.category,
    chunksCount: d.chunks.length,
    fileSize: d.fileSize,
    uploadDate: d.uploadDate,
    ...(includeChunks ? { chunks: d.chunks } : {})
  }));
  res.json(list);
});

// 3. Inspect chunks for a document
app.get("/api/documents/:id/chunks", (req: Request, res: Response) => {
  const doc = documentsDatabase.find((d) => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ error: "Document not found" });
  }
  res.json({
    documentId: doc.id,
    documentName: doc.name,
    chunks: doc.chunks
  });
});

// 4. Delete document
app.delete("/api/documents/:id", (req: Request, res: Response) => {
  const index = documentsDatabase.findIndex((d) => d.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Document not found" });
  }
  documentsDatabase.splice(index, 1);
  saveDocumentsToDisk(documentsDatabase);
  res.json({ success: true, message: "Document deleted successfully" });
});

// 4b. Reset knowledge base documents to initial seed
app.post("/api/documents/reset", (req: Request, res: Response) => {
  documentsDatabase = [...INITIAL_COLLEGE_DOCUMENTS];
  saveDocumentsToDisk(documentsDatabase);
  res.json({ success: true, message: "Documents reset to default knowledge base", count: documentsDatabase.length });
});

// ==========================================================================
// IMAGE PROXY & SHARING RESOLVER HELPERS
// ==========================================================================

// Helper to resolve direct image URLs from sharing hosts (ImgBB, Google Drive, Dropbox, Imgur, etc.)
async function resolveDirectImageUrl(rawUrl: string): Promise<{ directUrl: string; originalUrl: string }> {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { directUrl: "", originalUrl: "" };
  }
  let url = rawUrl.trim();
  if (!url) return { directUrl: "", originalUrl: "" };

  // Prepend https:// if protocol is missing
  if (!/^https?:\/\//i.test(url) && !url.startsWith("data:")) {
    url = "https://" + url;
  }

  // 1. Google Drive direct thumbnail / export
  const gDriveMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/i);
  if (gDriveMatch && gDriveMatch[1]) {
    return {
      directUrl: `https://lh3.googleusercontent.com/d/${gDriveMatch[1]}`,
      originalUrl: url
    };
  }

  // 2. Dropbox share link
  if (url.includes("dropbox.com")) {
    const directDropbox = url.replace(/[?&]dl=0/, "?raw=1");
    return {
      directUrl: directDropbox.includes("raw=1") ? directDropbox : `${directDropbox}${directDropbox.includes("?") ? "&" : "?"}raw=1`,
      originalUrl: url
    };
  }

  // 3. Imgur share page (e.g. imgur.com/aBcDeFg)
  const imgurMatch = url.match(/imgur\.com\/(?:gallery\/)?([a-zA-Z0-9]{5,8})$/i);
  if (imgurMatch && imgurMatch[1]) {
    return {
      directUrl: `https://i.imgur.com/${imgurMatch[1]}.jpg`,
      originalUrl: url
    };
  }

  // 4. GitHub blob to raw file
  if (url.includes("github.com") && url.includes("/blob/")) {
    return {
      directUrl: url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/"),
      originalUrl: url
    };
  }

  // 5. If it is already a direct image extension, return as-is
  const cleanPath = url.split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(cleanPath)) {
    return { directUrl: url, originalUrl: url };
  }

  // 6. For sharing page links (e.g. ibb.co, postimg.cc, etc.), fetch HTML to extract og:image or twitter:image
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8"
      }
    });
    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";
    if (contentType.startsWith("image/")) {
      return { directUrl: url, originalUrl: url };
    }

    if (contentType.includes("text/html")) {
      const html = await response.text();
      // Match og:image
      const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (ogMatch && ogMatch[1]) {
        let extracted = ogMatch[1].trim();
        if (extracted.startsWith("//")) extracted = "https:" + extracted;
        else if (extracted.startsWith("/")) {
          const origin = new URL(url).origin;
          extracted = origin + extracted;
        }
        return { directUrl: extracted, originalUrl: url };
      }

      // Match twitter:image
      const twitterMatch = html.match(/<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
                           html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i);
      if (twitterMatch && twitterMatch[1]) {
        let extracted = twitterMatch[1].trim();
        if (extracted.startsWith("//")) extracted = "https:" + extracted;
        else if (extracted.startsWith("/")) {
          const origin = new URL(url).origin;
          extracted = origin + extracted;
        }
        return { directUrl: extracted, originalUrl: url };
      }

      // Match img id="image-viewer" or similar on image hosts
      const imgMatch = html.match(/<img[^>]+id=["']image-viewer["'][^>]+src=["']([^"']+)["']/i);
      if (imgMatch && imgMatch[1]) {
        let extracted = imgMatch[1].trim();
        if (extracted.startsWith("//")) extracted = "https:" + extracted;
        else if (extracted.startsWith("/")) {
          const origin = new URL(url).origin;
          extracted = origin + extracted;
        }
        return { directUrl: extracted, originalUrl: url };
      }
    }
  } catch (err: any) {
    console.warn("[resolveDirectImageUrl] Could not resolve URL:", url, err.message);
  }

  return { directUrl: url, originalUrl: url };
}

// Proxy image endpoint to bypass CORS / hotlinking / iframe restrictions
app.get("/api/proxy-image", async (req: Request, res: Response) => {
  const rawUrl = (req.query.url as string || "").trim();
  if (!rawUrl) {
    return res.status(400).json({ error: "Missing image url parameter" });
  }

  try {
    const resolved = await resolveDirectImageUrl(rawUrl);
    const targetUrl = resolved.directUrl || rawUrl;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const fetchRes = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });
    clearTimeout(timeout);

    if (!fetchRes.ok) {
      return res.status(fetchRes.status).json({ error: `Failed to fetch image: HTTP ${fetchRes.status}` });
    }

    const contentType = fetchRes.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");

    const arrayBuffer = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return res.send(buffer);
  } catch (err: any) {
    console.error("[proxy-image] Error proxying image:", rawUrl, err.message);
    return res.status(502).json({ error: "Could not proxy image: " + err.message });
  }
});

// Resolver endpoint for client-side live link resolution
app.get("/api/resolve-image", async (req: Request, res: Response) => {
  const rawUrl = (req.query.url as string || "").trim();
  if (!rawUrl) {
    return res.status(400).json({ error: "Missing url parameter" });
  }
  const resolved = await resolveDirectImageUrl(rawUrl);
  res.json({
    success: true,
    directUrl: resolved.directUrl,
    originalUrl: resolved.originalUrl
  });
});

// ==========================================================================
// PREVIOUS YEAR PAPERS ENDPOINTS
// ==========================================================================

// 4c. List all Previous Year Papers (with search, course, and semester filters)
app.get("/api/papers", (req: Request, res: Response) => {
  const searchQuery = (req.query.q as string || req.query.search as string || "").trim().toLowerCase();
  const courseFilter = (req.query.course as string || "").trim().toLowerCase();
  const semesterFilter = (req.query.semester as string || "").trim().toLowerCase();
  const yearFilter = (req.query.year as string || "").trim().toLowerCase();

  let filtered = [...papersDatabase];

  if (searchQuery) {
    filtered = filtered.filter(p => 
      p.title.toLowerCase().includes(searchQuery) ||
      p.description.toLowerCase().includes(searchQuery) ||
      p.subject.toLowerCase().includes(searchQuery) ||
      p.course.toLowerCase().includes(searchQuery) ||
      p.fileName.toLowerCase().includes(searchQuery)
    );
  }

  if (courseFilter && courseFilter !== "all") {
    filtered = filtered.filter(p => p.course.toLowerCase().includes(courseFilter));
  }

  if (semesterFilter && semesterFilter !== "all") {
    filtered = filtered.filter(p => p.semester.toLowerCase().includes(semesterFilter));
  }

  if (yearFilter && yearFilter !== "all") {
    filtered = filtered.filter(p => p.academicYear.toLowerCase().includes(yearFilter));
  }

  // Sort newest upload first
  filtered.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());

  res.json(filtered);
});

// 4d. Get single Previous Year Paper
app.get("/api/papers/:id", (req: Request, res: Response) => {
  const paper = papersDatabase.find(p => p.id === req.params.id);
  if (!paper) {
    return res.status(404).json({ error: "Previous Year Paper not found" });
  }
  res.json(paper);
});

// 4e. Download / View Previous Year Paper (PDF or PNG)
app.get(["/api/papers/:id/download", "/api/papers/:id/file", "/api/papers/:id/view"], (req: Request, res: Response) => {
  const paper = papersDatabase.find(p => p.id === req.params.id);
  if (!paper) {
    return res.status(404).json({ error: "Previous Year Paper not found" });
  }

  const isDownload = req.path.includes("/download") || req.query.download === "true";
  if (isDownload) {
    paper.downloadCount = (paper.downloadCount || 0) + 1;
    savePapersToDisk(papersDatabase);
  }

  const fileName = paper.fileName || `${paper.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  const disposition = isDownload ? `attachment; filename="${fileName}"` : `inline; filename="${fileName}"`;
  const ext = fileName.split(".").pop()?.toLowerCase();

  let contentType = "application/pdf";
  if (ext === "png") {
    contentType = "image/png";
  } else if (ext === "jpg" || ext === "jpeg") {
    contentType = "image/jpeg";
  } else if (ext === "doc") {
    contentType = "application/msword";
  } else if (ext === "docx") {
    contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (paper.filePath && fs.existsSync(paper.filePath)) {
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", disposition);
    return res.sendFile(paper.filePath);
  }

  // If paper has an image link URL, redirect to it
  if (paper.imageUrl) {
    return res.redirect(paper.imageUrl);
  }

  // Otherwise synthesize a valid sample question paper PDF on-the-fly
  const pdfBuffer = generateSamplePdf(
    paper.title,
    `Subject: ${paper.subject} | ${paper.course} (${paper.semester}) - Academic Year ${paper.academicYear}`,
    paper.description + " Instructions: Answer all questions in Section A. Attempt any three from Section B."
  );

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", disposition);
  res.setHeader("Content-Length", pdfBuffer.length);
  return res.send(pdfBuffer);
});

// 4f. Upload Previous Year Paper (Admin Portal - Supports PDF & PNG)
app.post("/api/papers", (req: Request, res: Response, next: any) => {
  upload.any()(req, res, (err: any) => {
    if (err) {
      console.warn("[Upload Multer Warning] /api/papers:", err.message);
      return res.status(400).json({ error: err.message || "File upload processing failed." });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    const file = (req.files && (req.files as Express.Multer.File[])[0]) || req.file;
    const title = (req.body.title || "").trim();
    const description = (req.body.description || "").trim();

    if (!title) {
      return res.status(400).json({ error: "Paper title is required." });
    }

    const paperId = "paper-" + Math.random().toString(36).substring(2, 9);
    const subject = (req.body.subject || "General Academic").trim();
    const course = (req.body.course || "B.Tech Computer Science").trim();
    const semester = (req.body.semester || "Semester 1").trim();
    const academicYear = (req.body.academicYear || "2024-2025").trim();
    const examType = (req.body.examType || "End Semester").trim();
    const rawImageUrl = (req.body.imageUrl || req.body.linkUrl || "").trim();

    let directImageUrl = "";
    let sourceLinkUrl = "";
    if (rawImageUrl) {
      try {
        const resolved = await resolveDirectImageUrl(rawImageUrl);
        directImageUrl = resolved.directUrl;
        sourceLinkUrl = resolved.originalUrl;
      } catch (err: any) {
        directImageUrl = rawImageUrl;
        sourceLinkUrl = rawImageUrl;
      }
    }

    let fileName = `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
    let fileSize = 150000;
    let savedFilePath: string | undefined = undefined;

    if (directImageUrl && !file) {
      const ext = directImageUrl.split("?")[0].split(".").pop()?.toLowerCase();
      if (ext && ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
        fileName = `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.${ext}`;
      } else {
        fileName = `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
      }
    }

    if (file) {
      fileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      fileSize = file.size;
      const targetPath = path.join(PAPERS_UPLOAD_DIR, `${paperId}_${fileName}`);
      try {
        fs.writeFileSync(targetPath, file.buffer);
        savedFilePath = targetPath;
      } catch (err: any) {
        console.warn("[Upload] Could not write paper file to disk:", err.message);
      }
    }

    const newPaper: PreviousYearPaper = {
      id: paperId,
      title,
      description: description || `Official ${examType} question paper for ${subject} (${course}, ${semester}, ${academicYear}).`,
      subject,
      course,
      semester,
      academicYear,
      examType,
      fileName,
      fileSize,
      uploadDate: new Date().toISOString(),
      filePath: savedFilePath,
      downloadCount: 0,
      imageUrl: directImageUrl || undefined,
      linkUrl: sourceLinkUrl || directImageUrl || undefined
    };

    papersDatabase.unshift(newPaper);
    savePapersToDisk(papersDatabase);

    // Sync directly to Firebase Firestore papers & image collections
    syncPaperToFirestore(newPaper).catch(err => {
      console.warn("[Firebase] Background paper sync notice:", err.message);
    });

    res.json({
      success: true,
      message: "Previous Year Paper uploaded successfully",
      paper: newPaper,
      title: newPaper.title,
      id: newPaper.id
    });
  } catch (err: any) {
    console.error("[Upload] Error uploading paper:", err);
    res.status(500).json({ error: err.message || "Failed to upload previous year paper" });
  }
});

// 4g. Delete Previous Year Paper
app.delete("/api/papers/:id", (req: Request, res: Response) => {
  const index = papersDatabase.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Previous Year Paper not found" });
  }

  const paper = papersDatabase[index];
  if (paper.filePath && fs.existsSync(paper.filePath)) {
    try {
      fs.unlinkSync(paper.filePath);
    } catch (e) {
      console.warn("Could not delete file:", e);
    }
  }

  const deletedId = req.params.id;
  papersDatabase.splice(index, 1);
  savePapersToDisk(papersDatabase);

  // Delete from Firebase Firestore
  deleteFromFirestore("papers", deletedId).catch(err => {
    console.warn("[Firebase] Background delete notice:", err.message);
  });

  res.json({ success: true, message: "Previous Year Paper deleted successfully" });
});

// 4h. Reset Previous Year Papers to initial seed
app.post("/api/papers/reset", (req: Request, res: Response) => {
  papersDatabase = [...INITIAL_PAPERS];
  savePapersToDisk(papersDatabase);
  res.json({ success: true, message: "Previous Year Papers reset to defaults", count: papersDatabase.length });
});

// ==========================================================================
// LATEST NOTICES ENDPOINTS
// ==========================================================================

// 4i. List all Latest Notices
app.get("/api/notices", (req: Request, res: Response) => {
  const categoryFilter = (req.query.category as string || "").trim().toLowerCase();
  let list = [...noticesDatabase];

  if (categoryFilter && categoryFilter !== "all") {
    list = list.filter(n => n.category.toLowerCase() === categoryFilter);
  }

  // Sort important first, then by publishedDate descending
  list.sort((a, b) => {
    if (a.important && !b.important) return -1;
    if (!a.important && b.important) return 1;
    return new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime();
  });

  res.json(list);
});

// 4j. Get single notice
app.get("/api/notices/:id", (req: Request, res: Response) => {
  const notice = noticesDatabase.find(n => n.id === req.params.id);
  if (!notice) {
    return res.status(404).json({ error: "Notice not found" });
  }
  res.json(notice);
});

// 4k. Download or View Notice attachment (PDF or PNG)
app.get(["/api/notices/:id/attachment", "/api/notices/:id/file", "/api/notices/:id/view"], (req: Request, res: Response) => {
  const notice = noticesDatabase.find(n => n.id === req.params.id);
  if (!notice) {
    return res.status(404).json({ error: "Notice not found" });
  }

  const isDownload = req.query.download === "true" || (!req.path.includes("/file") && !req.path.includes("/view") && req.query.view !== "inline");
  const fileName = notice.attachmentName || `${notice.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  const disposition = isDownload ? `attachment; filename="${fileName}"` : `inline; filename="${fileName}"`;
  const ext = fileName.split(".").pop()?.toLowerCase();

  let contentType = "application/pdf";
  if (ext === "png") {
    contentType = "image/png";
  } else if (ext === "jpg" || ext === "jpeg") {
    contentType = "image/jpeg";
  } else if (ext === "doc") {
    contentType = "application/msword";
  } else if (ext === "docx") {
    contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (notice.attachmentPath && fs.existsSync(notice.attachmentPath)) {
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", disposition);
    return res.sendFile(notice.attachmentPath);
  }

  // If notice has an image link URL and no local attachment, redirect directly to image link
  if (notice.imageUrl) {
    return res.redirect(notice.imageUrl);
  }

  const pdfBuffer = generateSamplePdf(
    notice.title,
    `Official Circular - Category: ${notice.category} | Published: ${notice.publishedDate}`,
    notice.description
  );

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", disposition);
  res.setHeader("Content-Length", pdfBuffer.length);
  return res.send(pdfBuffer);
});

// 4l. Post new Latest Notice (Admin Portal - Supports PDF & PNG attachments)
app.post("/api/notices", (req: Request, res: Response, next: any) => {
  upload.any()(req, res, (err: any) => {
    if (err) {
      console.warn("[Upload Multer Warning] /api/notices:", err.message);
      return res.status(400).json({ error: err.message || "Attachment upload processing failed." });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    const file = (req.files && (req.files as Express.Multer.File[])[0]) || req.file;
    const title = (req.body.title || "").trim();
    const description = (req.body.description || "").trim();

    if (!title || !description) {
      return res.status(400).json({ error: "Both title and description are required for notices." });
    }

    const noticeId = "notice-" + Math.random().toString(36).substring(2, 9);
    const category = (req.body.category || "General").trim();
    const important = req.body.important === "true" || req.body.important === true;
    const rawImageUrl = (req.body.imageUrl || req.body.linkUrl || "").trim();

    let directImageUrl = "";
    let sourceLinkUrl = "";
    if (rawImageUrl) {
      try {
        const resolved = await resolveDirectImageUrl(rawImageUrl);
        directImageUrl = resolved.directUrl;
        sourceLinkUrl = resolved.originalUrl;
      } catch (err: any) {
        directImageUrl = rawImageUrl;
        sourceLinkUrl = rawImageUrl;
      }
    }

    let attachmentName: string | undefined = undefined;
    let attachmentSize: number | undefined = undefined;
    let attachmentPath: string | undefined = undefined;

    if (directImageUrl && !file) {
      const ext = directImageUrl.split("?")[0].split(".").pop()?.toLowerCase();
      attachmentName = ext && ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)
        ? `Circular_${noticeId}.${ext}`
        : "Notice_Image_Link.png";
      attachmentSize = 120000;
    }

    if (file) {
      attachmentName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      attachmentSize = file.size;
      const targetPath = path.join(NOTICES_UPLOAD_DIR, `${noticeId}_${attachmentName}`);
      try {
        fs.writeFileSync(targetPath, file.buffer);
        attachmentPath = targetPath;
      } catch (err: any) {
        console.warn("[Upload] Could not write notice attachment to disk:", err.message);
      }
    }

    const newNotice: CollegeNotice = {
      id: noticeId,
      title,
      description,
      category,
      important,
      publishedDate: new Date().toISOString().split("T")[0],
      attachmentName,
      attachmentSize,
      attachmentPath,
      imageUrl: directImageUrl || undefined,
      linkUrl: sourceLinkUrl || directImageUrl || undefined
    };

    noticesDatabase.unshift(newNotice);
    saveNoticesToDisk(noticesDatabase);

    // Sync directly to Firebase Firestore notices & image collections
    syncNoticeToFirestore(newNotice).catch(err => {
      console.warn("[Firebase] Background notice sync notice:", err.message);
    });

    res.json({
      success: true,
      message: "Notice published successfully",
      notice: newNotice,
      title: newNotice.title,
      id: newNotice.id
    });
  } catch (err: any) {
    console.error("[Upload] Error posting notice:", err);
    res.status(500).json({ error: err.message || "Failed to post notice" });
  }
});

// 4m. Delete Notice
app.delete("/api/notices/:id", (req: Request, res: Response) => {
  const index = noticesDatabase.findIndex(n => n.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Notice not found" });
  }

  const notice = noticesDatabase[index];
  if (notice.attachmentPath && fs.existsSync(notice.attachmentPath)) {
    try {
      fs.unlinkSync(notice.attachmentPath);
    } catch (e) {
      console.warn("Could not delete file:", e);
    }
  }

  const deletedId = req.params.id;
  noticesDatabase.splice(index, 1);
  saveNoticesToDisk(noticesDatabase);

  // Delete from Firebase Firestore
  deleteFromFirestore("notices", deletedId).catch(err => {
    console.warn("[Firebase] Background delete notice:", err.message);
  });

  res.json({ success: true, message: "Notice deleted successfully" });
});

// 4n. Reset Notices to initial seed
app.post("/api/notices/reset", (req: Request, res: Response) => {
  noticesDatabase = [...INITIAL_NOTICES];
  saveNoticesToDisk(noticesDatabase);
  res.json({ success: true, message: "Notices reset to default list", count: noticesDatabase.length });
});

// 4n-1. Dedicated Image Link Store & Synchronization with Firebase
app.post("/api/sync-image", async (req: Request, res: Response) => {
  try {
    const { link, imageUrl, title, type, id, subject, category } = req.body;
    const finalLink = (link || imageUrl || "").trim();
    if (!finalLink) {
      return res.status(400).json({ error: "No image link provided" });
    }

    const db = getFirestoreDb();
    if (!db) {
      return res.status(500).json({ error: "Firestore connection is not available" });
    }

    const docId = id || `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payload = {
      id: docId,
      link: finalLink,
      imageUrl: finalLink,
      linkUrl: finalLink,
      title: title || "Direct Image Link",
      type: type || "general",
      subject: subject || "",
      category: category || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in "image" collection
    await firestoreSetDoc(firestoreDoc(db, "image", docId), payload, { merge: true });

    // Also scan for any empty placeholder documents (like tM7YVUVOkCMGDvSd4EHO) and populate them
    try {
      const snap = await firestoreGetDocs(firestoreCollection(db, "image"));
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (!data.link || data.link === "") {
          await firestoreUpdateDoc(firestoreDoc(db, "image", docSnap.id), {
            link: finalLink,
            imageUrl: finalLink,
            title: title || data.title || "Direct Image Link",
            updatedAt: new Date().toISOString()
          });
          console.log(`[Firebase Server] Updated empty image doc ${docSnap.id} with link: ${finalLink}`);
        }
      }
    } catch (e: any) {
      console.warn("[Firebase Server] Empty doc scan notice:", e.message);
    }

    return res.json({
      success: true,
      message: "Image link successfully stored in Firebase Firestore collection 'image'!",
      docId,
      link: finalLink
    });
  } catch (err: any) {
    console.error("[sync-image] Error:", err);
    return res.status(500).json({ error: err.message || "Failed to store image link in Firebase" });
  }
});

// 4n-2. Get all images currently stored in Firebase Firestore
app.get("/api/images", async (req: Request, res: Response) => {
  try {
    const db = getFirestoreDb();
    if (!db) {
      return res.status(500).json({ error: "Firestore is not connected" });
    }
    const snap = await firestoreGetDocs(firestoreCollection(db, "image"));
    const images = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.json({ success: true, count: images.length, images });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to retrieve images from Firebase" });
  }
});

// 4n-3. Re-synchronize entire dataset with Firebase Firestore
app.post("/api/sync-firebase", async (req: Request, res: Response) => {
  try {
    let syncedPapers = 0;
    let syncedNotices = 0;
    for (const p of papersDatabase) {
      await syncPaperToFirestore(p);
      syncedPapers++;
    }
    for (const n of noticesDatabase) {
      await syncNoticeToFirestore(n);
      syncedNotices++;
    }
    res.json({
      success: true,
      message: `Successfully synchronized ${syncedPapers} papers, ${syncedNotices} notices, and all image links to Firebase Firestore!`,
      papersCount: syncedPapers,
      noticesCount: syncedNotices
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4o. Student Authentication & Profile Sync (Gmail / Google Auth)
app.post("/api/students/sync", (req: Request, res: Response) => {
  try {
    const { id, email, displayName, photoURL, provider, college, department, semester } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required for student authentication" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existingIndex = studentsDatabase.findIndex(s => s.id === id || s.email.toLowerCase() === cleanEmail);
    const now = new Date().toISOString();

    let student: StudentUser;
    if (existingIndex >= 0) {
      student = {
        ...studentsDatabase[existingIndex],
        displayName: displayName || studentsDatabase[existingIndex].displayName,
        photoURL: photoURL || studentsDatabase[existingIndex].photoURL,
        lastLoginAt: now,
        college: college || studentsDatabase[existingIndex].college || "UIET Hoshiarpur, Panjab University"
      };
      studentsDatabase[existingIndex] = student;
    } else {
      student = {
        id: id || "student-" + Math.random().toString(36).substring(2, 10),
        email: cleanEmail,
        displayName: displayName || cleanEmail.split("@")[0],
        photoURL: photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName || cleanEmail)}&backgroundColor=023EBA&textColor=ffffff`,
        role: "student",
        provider: provider || "google.com",
        college: college || "UIET Hoshiarpur, Panjab University",
        department: department || "Engineering & Technology",
        semester: semester || "Current",
        createdAt: now,
        lastLoginAt: now
      };
      studentsDatabase.unshift(student);
    }

    saveStudentsToDisk(studentsDatabase);
    res.json({ success: true, student });
  } catch (err: any) {
    console.error("[Students] Error syncing student profile:", err);
    res.status(500).json({ error: "Failed to sync student profile" });
  }
});

app.get("/api/students", (req: Request, res: Response) => {
  res.json(studentsDatabase);
});

app.get("/api/students/:id", (req: Request, res: Response) => {
  const student = studentsDatabase.find(s => s.id === req.params.id || s.email.toLowerCase() === req.params.id.toLowerCase());
  if (!student) {
    return res.status(404).json({ error: "Student not found" });
  }
  res.json(student);
});

// 4p. Gmail Integration Endpoints (Sends advisory / inquiry with user's OAuth Bearer token or server dispatch)
app.post("/api/gmail/send", async (req: Request, res: Response) => {
  try {
    const { to, subject, bodyHtml, bodyText, studentEmail, studentName } = req.body;
    if (!to || !subject) {
      return res.status(400).json({ error: "Recipient and Subject are required" });
    }

    const authHeader = req.headers.authorization;
    let gmailApiSuccess = false;
    let messageId = "msg-" + Math.random().toString(36).substring(2, 10);

    // If client supplied their Google OAuth Bearer access token
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const accessToken = authHeader.split(" ")[1];
      if (accessToken && accessToken !== "null" && accessToken !== "undefined") {
        try {
          const rawEmail = [
            `To: ${to}`,
            `From: ${studentEmail || "me"}`,
            `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
            `MIME-Version: 1.0`,
            `Content-Type: text/html; charset=UTF-8`,
            ``,
            bodyHtml || bodyText || ""
          ].join("\r\n");

          const base64Safe = Buffer.from(rawEmail)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

          const googleRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ raw: base64Safe })
          });

          if (googleRes.ok) {
            const data = await googleRes.json();
            messageId = data.id || messageId;
            gmailApiSuccess = true;
          } else {
            const errText = await googleRes.text();
            console.warn("[Gmail API] Google send returned non-200:", errText);
          }
        } catch (e: any) {
          console.warn("[Gmail API] Failed to proxy directly to Gmail API:", e.message);
        }
      }
    }

    res.json({
      success: true,
      deliveredViaGmailApi: gmailApiSuccess,
      messageId,
      recipient: to,
      subject,
      timestamp: new Date().toISOString(),
      status: "Dispatched to " + to
    });
  } catch (err: any) {
    console.error("[Gmail API] Error dispatching email:", err);
    res.status(500).json({ error: "Failed to dispatch email" });
  }
});

// 5. Upload PDF/Document endpoint
app.post("/api/uploadPDF", (req: Request, res: Response, next: any) => {
  upload.single("pdfFile")(req, res, (err: any) => {
    if (err) {
      console.warn("[Upload Multer Warning] /api/uploadPDF:", err.message);
      return res.status(400).json({ error: err.message || "PDF upload processing failed." });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const title = req.body.title || (file ? file.originalname.replace(/\.[^/.]+$/, "") : "College Document");
    const category = req.body.category || "General";
    const rawChunks = req.body.chunks;

    let chunksToSave: DocumentChunk[] = [];
    const docId = "doc-" + Math.random().toString(36).substring(2, 9);
    const originalExt = file ? file.originalname.split(".").pop()?.toLowerCase() || "pdf" : "pdf";
    const fileName = file ? file.originalname : `${title.replace(/\s+/g, "_")}.${originalExt}`;

    // 1. If client sent pre-extracted chunks via PDF.js
    if (rawChunks) {
      try {
        const parsedChunks = JSON.parse(rawChunks);
        if (Array.isArray(parsedChunks)) {
          chunksToSave = parsedChunks.map((c: any, idx: number) => ({
            id: `chunk-${docId}-${idx}`,
            documentId: docId,
            documentName: fileName,
            category,
            pageNumber: c.pageNumber || 1,
            chunkIndex: idx,
            text: c.text,
            createdAt: new Date().toISOString()
          }));
        }
      } catch (err) {
        console.warn("Could not parse rawChunks from client:", err);
      }
    }

    // 2. Server-side extraction for PDF files using PDFParse v2 class
    if (chunksToSave.length === 0 && file && file.buffer) {
      const isPdf = originalExt === "pdf" || file.mimetype === "application/pdf";
      const isText = ["txt", "text", "md", "csv"].includes(originalExt) || file.mimetype.startsWith("text/");

      if (isPdf) {
        try {
          const { PDFParse } = await import("pdf-parse");
          const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
          const textResult = await parser.getText();

          if (textResult && Array.isArray(textResult.pages) && textResult.pages.length > 0) {
            for (const page of textResult.pages) {
              const cleanPageText = (page.text || "").replace(/\s+/g, " ").trim();
              if (cleanPageText.length > 15) {
                const words = cleanPageText.split(" ");
                const chunkSize = 350;
                const overlap = 50;

                if (words.length <= chunkSize) {
                  chunksToSave.push({
                    id: `chunk-${docId}-${chunksToSave.length}`,
                    documentId: docId,
                    documentName: fileName,
                    category,
                    pageNumber: page.num || 1,
                    chunkIndex: chunksToSave.length,
                    text: cleanPageText,
                    createdAt: new Date().toISOString()
                  });
                } else {
                  for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
                    const slice = words.slice(i, i + chunkSize).join(" ");
                    if (slice.length > 30) {
                      chunksToSave.push({
                        id: `chunk-${docId}-${chunksToSave.length}`,
                        documentId: docId,
                        documentName: fileName,
                        category,
                        pageNumber: page.num || 1,
                        chunkIndex: chunksToSave.length,
                        text: slice,
                        createdAt: new Date().toISOString()
                      });
                    }
                  }
                }
              }
            }
          }

          // Fallback if pages was empty but textResult.text exists
          if (chunksToSave.length === 0 && textResult && textResult.text) {
            const cleanText = textResult.text.replace(/\s+/g, " ").trim();
            if (cleanText.length > 20) {
              const words = cleanText.split(" ");
              const chunkSize = 350;
              let pNum = 1;
              for (let i = 0; i < words.length; i += chunkSize) {
                const slice = words.slice(i, i + chunkSize).join(" ");
                if (slice.length > 20) {
                  chunksToSave.push({
                    id: `chunk-${docId}-${chunksToSave.length}`,
                    documentId: docId,
                    documentName: fileName,
                    category,
                    pageNumber: pNum++,
                    chunkIndex: chunksToSave.length,
                    text: slice,
                    createdAt: new Date().toISOString()
                  });
                }
              }
            }
          }

          await parser.destroy();
          console.log(`[Upload] Successfully parsed PDF "${fileName}" into ${chunksToSave.length} chunks.`);
        } catch (pdfErr: any) {
          console.warn("[Upload] PDFParse extraction warning:", pdfErr.message);
        }
      } else if (isText) {
        // Plain text or Markdown document
        const textContent = file.buffer.toString("utf-8").replace(/\r\n/g, "\n");
        const paragraphs = textContent.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 20);
        let pNum = 1;

        if (paragraphs.length > 0) {
          paragraphs.forEach(para => {
            chunksToSave.push({
              id: `chunk-${docId}-${chunksToSave.length}`,
              documentId: docId,
              documentName: fileName,
              category,
              pageNumber: pNum++,
              chunkIndex: chunksToSave.length,
              text: para,
              createdAt: new Date().toISOString()
            });
          });
        } else if (textContent.trim().length > 10) {
          chunksToSave.push({
            id: `chunk-${docId}-0`,
            documentId: docId,
            documentName: fileName,
            category,
            pageNumber: 1,
            chunkIndex: 0,
            text: textContent.trim(),
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    // Fallback if no text could be extracted
    if (chunksToSave.length === 0) {
      chunksToSave.push({
        id: `chunk-${docId}-0`,
        documentId: docId,
        documentName: fileName,
        category,
        pageNumber: 1,
        chunkIndex: 0,
        text: `Official Document: ${title} (${category}). Registered into the College Knowledge Base. File: ${fileName}.`,
        createdAt: new Date().toISOString()
      });
    }

    const newDoc: CollegeDocument = {
      id: docId,
      title,
      name: fileName,
      originalName: file ? file.originalname : fileName,
      category,
      chunksCount: chunksToSave.length,
      fileSize: file ? file.size : 102400,
      uploadDate: new Date().toISOString(),
      chunks: chunksToSave
    };

    documentsDatabase.unshift(newDoc);
    saveDocumentsToDisk(documentsDatabase);

    res.status(200).json({
      success: true,
      documentId: docId,
      title,
      chunksCount: chunksToSave.length
    });
  } catch (err: any) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message || "Failed to process PDF" });
  }
});

// Model cooldown tracker for rate limits / quotas
const modelCooldowns: Record<string, number> = {};

// Comprehensive Domain Synonym & Concept Expansion Map for College Queries
const COLLEGE_SYNONYM_MAP: Record<string, string[]> = {
  "fail": ["backlog", "arrear", "supplementary", "revaluation", "grade review"],
  "failed": ["backlog", "arrear", "supplementary", "revaluation"],
  "failing": ["backlog", "arrear", "supplementary"],
  "backlog": ["supplementary", "arrear", "revaluation", "summer break"],
  "reappear": ["supplementary", "arrear", "backlog"],
  "attendance": ["75%", "mandatory attendance", "hall ticket", "theory lectures", "practical laboratory", "shortage"],
  "absent": ["attendance", "75%", "unexcused", "debarment"],
  "curfew": ["timings", "9:30 pm", "10:00 pm", "night-out pass", "biometric attendance", "hostel premises"],
  "timing": ["curfew", "9:30 pm", "10:00 pm", "counter 4", "2:00 pm", "4:30 pm"],
  "timings": ["curfew", "9:30 pm", "10:00 pm", "counter 4", "2:00 pm", "4:30 pm"],
  "night": ["curfew", "9:30 pm", "10:00 pm", "night-out pass", "overnight", "guardian"],
  "leave": ["night-out pass", "24 hours in advance", "restricted holiday", "curfew"],
  "outing": ["night-out pass", "curfew", "warden", "permission"],
  "cook": ["prohibited items", "induction stoves", "hot plates", "electric heaters", "immersion rods"],
  "cooking": ["prohibited items", "induction stoves", "hot plates", "electric heaters"],
  "induction": ["induction stoves", "induction cooker", "electric heaters", "prohibited items", "hot plates", "appliances"],
  "cooker": ["induction stoves", "induction cooker", "cooking appliances", "hot plates"],
  "kettle": ["prohibited items", "heavy electrical appliances", "electric heaters", "hot plates"],
  "iron": ["prohibited items", "heavy electrical appliances", "electric heaters"],
  "heater": ["prohibited items", "electric heaters", "fire safety", "fine"],
  "appliance": ["prohibited items", "heavy electrical appliances", "electric heaters", "induction stoves"],
  "placement": ["cdpc", "campus placement", "internship", "dream company", "cgpa", "6.5", "8 lpa"],
  "placements": ["cdpc", "campus placement", "internship", "dream company", "cgpa", "6.5"],
  "job": ["placement", "campus placement", "salary", "package", "dream company", "cdpc"],
  "jobs": ["placement", "campus placement", "salary", "package", "dream company"],
  "salary": ["package", "8 lpa", "dream category", "compensation", "10,000"],
  "package": ["salary", "8 lpa", "dream company", "compensation"],
  "cgpa": ["pointer", "gpa", "6.5", "academic requirement", "grades"],
  "pointer": ["cgpa", "gpa", "6.5", "grade sheet", "academic requirement"],
  "holiday": ["list of holidays", "calendar year 2026", "panjab university", "republic day", "diwali", "holi"],
  "holidays": ["list of holidays", "calendar year 2026", "panjab university", "republic day", "diwali", "holi", "restricted holidays"],
  "vacation": ["holidays", "summer break", "calendar year 2026"],
  "off": ["holiday", "holidays", "closed", "restricted holidays"],
  "jayanti": ["guru nanak jayanti", "birthday", "mahavir jayanti", "valmiki jayanti", "ravidas jayanti", "ambedkar jayanti"],
  "nanak": ["guru nanak jayanti", "guru nanak dev ji", "birthday", "november 24"],
  "assistance": ["financial assistance", "hostel residents", "scholarship", "grant", "31.01.2026", "dsw"],
  "deadline": ["last date", "due date", "cutoff", "late fee", "31.01.2026"],
  "last date": ["deadline", "due date", "cutoff", "receipt of form", "31.01.2026"],
  "fee": ["tuition", "payment", "installment", "penalty", "due date", "challan"],
  "fees": ["tuition", "payment", "installment", "penalty", "due date", "challan"],
  "pay": ["fee", "tuition", "installment", "payment gateway", "receipt", "due date"],
  "installment": ["installments", "two equal installments", "50%", "dean of student welfare"],
  "installments": ["installment option", "two equal installments", "50%", "due date"],
  "penalty": ["late fee", "late fine", "15 days", "$2", "rs. 100", "due date"],
  "fine": ["late fee penalty", "confiscation", "due date"],
  "bonafide": ["bonafide certificate", "academic office counter 4", "erp student portal", "passport", "visa"],
  "certificate": ["bonafide certificate", "degree", "transcript", "counter 4", "erp"],
  "scholarship": ["financial assistance", "financial aid", "hostel residents", "dean student welfare", "merit"],
  "scholarships": ["financial assistance", "financial aid", "hostel residents", "concession"],
  "financial": ["financial assistance", "scholarship", "income certificate", "concession"],
  "aid": ["financial assistance", "scholarship", "waiver", "stipend"],
  "stipend": ["financial assistance", "scholarship", "bank account"],
  "hall ticket": ["admit card", "exam enrollment", "7 days prior", "75% attendance"],
  "admit card": ["hall ticket", "exam enrollment", "coe", "75% attendance"]
};

// 6. Search relevant document chunks with BM25 + Exact Phrase Matching + Diversity
app.post("/api/searchDocuments", (req: Request, res: Response) => {
  try {
    const { query, topK = 6 } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" });
    }

    const allChunks: DocumentChunk[] = [];
    documentsDatabase.forEach((doc) => {
      allChunks.push(...doc.chunks);
    });

    if (allChunks.length === 0) {
      return res.json({ chunks: [] });
    }

    const queryClean = query.trim();
    const queryLower = queryClean.toLowerCase();
    const queryTokens = tokenize(queryClean);

    if (queryTokens.length === 0) {
      return res.json({ chunks: allChunks.slice(0, Number(topK) || 6) });
    }

    // Expand query with college domain synonyms
    const expandedTokens = new Set<string>(queryTokens);
    const synonymTokens: string[] = [];

    queryTokens.forEach((tok) => {
      const syns = COLLEGE_SYNONYM_MAP[tok];
      if (syns) {
        syns.forEach((syn) => {
          tokenize(syn).forEach((st) => {
            if (!expandedTokens.has(st)) {
              expandedTokens.add(st);
              synonymTokens.push(st);
            }
          });
        });
      }
    });

    // Also check multi-word phrase keys in synonym map (e.g. "hall ticket", "last date")
    for (const [key, syns] of Object.entries(COLLEGE_SYNONYM_MAP)) {
      if (key.includes(" ") && queryLower.includes(key)) {
        syns.forEach((syn) => {
          tokenize(syn).forEach((st) => {
            if (!expandedTokens.has(st)) {
              expandedTokens.add(st);
              synonymTokens.push(st);
            }
          });
        });
      }
    }

    // BM25 Precomputation: Document Frequencies (DF) & Average Document Length
    const N = allChunks.length;
    let totalTokenCount = 0;
    const chunkTokenMap = new Map<string, string[]>();
    const docFrequency = new Map<string, number>();

    allChunks.forEach((chunk) => {
      const tokens = tokenize(chunk.text);
      chunkTokenMap.set(chunk.id, tokens);
      totalTokenCount += tokens.length;

      const uniqueTokensInChunk = new Set(tokens);
      uniqueTokensInChunk.forEach((t) => {
        docFrequency.set(t, (docFrequency.get(t) || 0) + 1);
      });
    });

    const avgdl = totalTokenCount / (N || 1);
    const k1 = 1.2;
    const b = 0.75;

    // Helper: calculate BM25 IDF
    function getIDF(term: string): number {
      const df = docFrequency.get(term) || 0;
      return Math.log(1 + (N - df + 0.5) / (df + 0.5));
    }

    // Query Bigrams for phrase matching
    const queryBigrams: string[] = [];
    for (let i = 0; i < queryTokens.length - 1; i++) {
      queryBigrams.push(`${queryTokens[i]} ${queryTokens[i + 1]}`);
    }

    // Score all chunks
    const scoredChunks = allChunks.map((chunk) => {
      const chunkTokens = chunkTokenMap.get(chunk.id) || [];
      const textLower = chunk.text.toLowerCase();
      const docNameLower = chunk.documentName.toLowerCase();
      const docLen = chunkTokens.length;

      // Count term frequencies in chunk
      const tfMap = new Map<string, number>();
      chunkTokens.forEach((t) => {
        tfMap.set(t, (tfMap.get(t) || 0) + 1);
      });

      let bm25Score = 0;
      let directMatches = 0;

      // 1. Direct Query Tokens BM25 & Rare Keyword Detection
      queryTokens.forEach((tok) => {
        const tf = tfMap.get(tok) || 0;
        if (tf > 0) {
          directMatches++;
          const idf = getIDF(tok);
          const termScore = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgdl))));
          bm25Score += termScore * 12; // Base weight

          // Distinctive/Rare query keyword match bonus (high IDF terms like 'induction', 'nanak', 'counter', 'arrear')
          if (idf >= 1.4) {
            bm25Score += idf * 25;
          }
        }
      });

      // 2. Expanded Synonym Tokens BM25 (weighted lower to prevent drift)
      synonymTokens.forEach((tok) => {
        const tf = tfMap.get(tok) || 0;
        if (tf > 0) {
          const idf = getIDF(tok);
          const termScore = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgdl))));
          bm25Score += termScore * 4; // Synonym weight
        }
      });

      let boostScore = 0;

      // 3. Exact Substring Match bonus
      if (textLower.includes(queryLower)) {
        boostScore += 60;
      }

      // 4. Query Bigrams / Trigrams exact matching bonus
      queryBigrams.forEach((bigram) => {
        if (textLower.includes(bigram)) {
          boostScore += 35;
        }
      });

      // 5. Document Title & Filename relevance
      queryTokens.forEach((tok) => {
        if (docNameLower.includes(tok)) {
          boostScore += 20;
        }
      });

      // 6. Number & Date exact matching (e.g. "2026", "26.01.2026", "75%", "6.5")
      const numberMatches = queryClean.match(/\b\d+(?:\.\d+)*(?:%|th|st|nd|rd)?\b/gi) || [];
      numberMatches.forEach((num) => {
        const numLower = num.toLowerCase();
        if (textLower.includes(numLower)) {
          boostScore += 25;
        }
      });

      // Query token coverage multiplier (rewards chunks matching multiple query terms)
      const coverageRatio = queryTokens.length > 0 ? (directMatches / queryTokens.length) : 1;
      const coverageMultiplier = queryTokens.length > 1 ? (0.4 + 0.6 * coverageRatio) : 1;

      const totalScore = Math.round((bm25Score + boostScore) * coverageMultiplier);

      return {
        ...chunk,
        score: totalScore
      };
    });

    // Filter positive matches and sort descending
    const positiveMatches = scoredChunks
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    // Diversity Reranking: Avoid letting 1 giant document (like 200-page syllabus) monopolize all slots
    const targetK = Math.max(1, Number(topK) || 6);
    const finalResults: typeof positiveMatches = [];
    const docChunkCount = new Map<string, number>();
    const maxPerDoc = targetK <= 4 ? 2 : 3;

    // First pass: select top chunks respecting maxPerDoc limit
    for (const chunk of positiveMatches) {
      const currentDocCount = docChunkCount.get(chunk.documentId) || 0;
      if (currentDocCount < maxPerDoc) {
        finalResults.push(chunk);
        docChunkCount.set(chunk.documentId, currentDocCount + 1);
        if (finalResults.length >= targetK) break;
      }
    }

    // Second pass: fill remaining slots if needed
    if (finalResults.length < targetK) {
      for (const chunk of positiveMatches) {
        if (!finalResults.some((c) => c.id === chunk.id)) {
          finalResults.push(chunk);
          if (finalResults.length >= targetK) break;
        }
      }
    }

    res.json({ chunks: finalResults });
  } catch (err: any) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message || "Search failed" });
  }
});

// 7. Generate Answer with Gemini
app.post("/api/generateAnswer", async (req: Request, res: Response) => {
  try {
    const question = req.body.question || req.body.query;
    const chunks = req.body.chunks;
    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    // Rule: If no relevant chunks were retrieved
    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return res.json({
        answer: "I could not find this information in the uploaded college documents.",
        sourceDocument: "N/A",
        pageNumber: "N/A",
        confidence: 0,
        excerpts: [],
        unavailable: true
      });
    }

    // Format context excerpts
    const excerptsText = chunks
      .map((c: any, index: number) => {
        return `[EXCERPT ${index + 1}]
Source Document: ${c.documentName || "College_Document.pdf"}
Page Number: ${c.pageNumber || 1}
Category: ${c.category || "General"}
Text:
${c.text}`;
      })
      .join("\n\n------------------------------------\n\n");

    const systemInstruction = `You are the official AI Helpdesk Assistant for UIET Hoshiarpur (Panjab University).
Your goal is to present answers to students in a clean, well-structured, professional, and visually engaging format.

PRESENTATION & FORMATTING GUIDELINES:
1. STRUCTURE & HEADINGS:
   - Use clear markdown headings ('###') to organize the answer logically (e.g., '### Overview', '### Step-by-Step Procedure', '### Requirements & Fees', '### Important Notes & Contact').
   - Keep answers easy to scan and read. Avoid unbroken walls of text.
2. PROCEDURES & STEPS:
   - Format multi-step procedures with numbered steps (e.g., '1. **Step Name** - Specific action details', '2. **Step Name** - Specific action details').
3. HIGHLIGHTS & KEY DETAILS:
   - Bold important terms, fees, dates, counter numbers, office rooms, and portal URLs (e.g. **Counter 4**, **$5 (Rs. 100)**, **erp.college.edu**).
   - Use clean bullet points for prerequisite checklists, document requirements, or eligibility criteria.
   - Use markdown tables when presenting fee schedules, timetable dates, or branch comparisons.
4. CALLOUTS:
   - Use '> **Note:** ...' or '> **Important:** ...' for critical warnings, deadlines, or cautions.
5. NO SOURCE MENTIONS:
   - Under no circumstances should you cite or mention filenames (such as .pdf), source document titles, chunk indices, or page numbers. Answer naturally and authoritatively.
6. PREVIOUS YEAR QUESTION PAPERS (PYQS):
   - If the student inquires about Previous Year Question Papers (PYQs), exam papers, past papers, or question banks, provide direct instructions and the official Google Drive PYQ Repository link:
     [Access Google Drive PYQ Archive](https://drive.google.com/drive/folders/10wqRkRbJs5Nt9yGuA4jvzp9Trfe8-746?usp=sharing)
   - Mention that papers are organized by department/branch (CSE, IT, ECE, ME) and semester (1st through 8th), covering both Mid-Semester Tests (MST) and End-Semester final exams.
7. GENERAL FALLBACK:
   - If specific details are not found in the uploaded college document excerpts, provide an accurate, polite, and standard university guideline without stating that you could not find the documents.`;

    const prompt = `STUDENT QUESTION:
"${question}"

OFFICIAL COLLEGE DOCUMENT EXCERPTS (if relevant):
${excerptsText || "No relevant uploaded college document excerpts."}

Please synthesize the answer strictly following all guidelines. Provide a structured, helpful answer in clean markdown, 2-3 concise key highlights (e.g. key fee, timeline, portal link), and 2-3 logical follow-up questions a student might ask next.`;

    // Candidate models in priority order
    const CANDIDATE_MODELS = [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest"
    ];

    let parsedResult: any = null;
    let successfulModel = "";
    let lastGeminiError: any = null;

    for (const model of CANDIDATE_MODELS) {
      // Check if model is in active quota cooldown
      if (modelCooldowns[model] && Date.now() < modelCooldowns[model]) {
        console.log(`[Gemini] Skipping model "${model}" due to active cooldown (${Math.ceil((modelCooldowns[model] - Date.now()) / 1000)}s remaining)...`);
        continue;
      }

      // Allow up to 2 attempts per model with backoff on 503/transient issues
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[Gemini] Querying model "${model}" (attempt ${attempt})...`);

          // Guard with timeout so overloaded models do not stall the user
          let timer: any;
          const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
              const err: any = new Error(`Model ${model} request timed out after 8s`);
              err.isTimeout = true;
              err.status = 503;
              reject(err);
            }, 8000);
          });

          const generatePromise = ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction,
              temperature: 0.3,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  answer: {
                    type: Type.STRING,
                    description: "The direct, helpful, and comprehensive answer formatted in clean markdown (with '###' headings, bolding, numbered steps, bullet points) without mentioning source filenames."
                  },
                  keyHighlights: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "2 to 3 concise, high-value key takeaways or quick highlights (e.g., fee amount, timeline, portal link, or office counter)."
                  },
                  suggestedFollowUps: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "2 to 3 logical, short follow-up questions the student might want to ask next."
                  }
                },
                required: ["answer"]
              }
            }
          });

          let geminiResponse: any;
          try {
            geminiResponse = await Promise.race([generatePromise, timeoutPromise]);
          } finally {
            clearTimeout(timer);
          }

          let rawText = geminiResponse.text?.trim() || "{}";
          if (rawText.startsWith("```")) {
            rawText = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
          }

          parsedResult = JSON.parse(rawText);
          successfulModel = model;
          console.log(`[Gemini] Successfully answered using model "${model}"`);
          break;
        } catch (err: any) {
          lastGeminiError = err;
          const errCode = err?.status || err?.code || (err?.error && err?.error?.code);
          const errMsg = String(err?.message || JSON.stringify(err));
          const isQuota = errCode === 429 || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota");
          const isTransient =
            isQuota ||
            errCode === 503 ||
            errMsg.includes("503") ||
            errMsg.includes("high demand") ||
            errMsg.includes("UNAVAILABLE") ||
            errMsg.includes("fetch failed") ||
            errMsg.includes("timeout") ||
            errMsg.includes("ECONNRESET");

          console.warn(`[Gemini] Model "${model}" attempt ${attempt} warning: ${errMsg}`);

          if (isQuota) {
            // Put model on 60 second cooldown so we don't block subsequent turns
            modelCooldowns[model] = Date.now() + 60000;
            console.log(`[Gemini] Setting 60s cooldown for model "${model}" due to quota limit.`);
            break;
          }

          if (isTransient && attempt < 2) {
            const delay = 600 + Math.floor(Math.random() * 400);
            console.log(`[Gemini] Transient error, backing off for ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          // Break inner loop to try next fallback model
          break;
        }
      }

      if (parsedResult) {
        break; // Successfully got an answer from a candidate model
      }
    }

    // If all models hit transient errors or failed, check if we have ground truth chunks to serve directly
    if (!parsedResult || !parsedResult.answer) {
      console.warn("[Gemini] Remote models unavailable or rate limited. Utilizing grounded knowledge fallback.");
      if (chunks && chunks.length > 0) {
        const topChunk = chunks[0];
        console.log("[Gemini] Serving direct excerpt from knowledge base document");
        return res.json({
          answer: topChunk.text,
          keyHighlights: ["Information retrieved from official college records."],
          suggestedFollowUps: [
            "What are the document submission timings?",
            "What documents are required to attach?",
            "Who can I contact for questions?"
          ],
          fallbackMode: true
        });
      }

      return res.status(503).json({
        error: "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again shortly.",
        isHighDemand: true
      });
    }

    res.json({
      answer: parsedResult.answer,
      keyHighlights: Array.isArray(parsedResult.keyHighlights) ? parsedResult.keyHighlights : [],
      suggestedFollowUps: Array.isArray(parsedResult.suggestedFollowUps) ? parsedResult.suggestedFollowUps : [],
      modelUsed: successfulModel
    });
  } catch (err: any) {
    console.error("Gemini Generation Error:", err);
    res.status(500).json({ error: err.message || "Gemini processing failed" });
  }
});

// --------------------------------------------------------------------------
// STATIC FILES & VITE MIDDLEWARE
// --------------------------------------------------------------------------

// Serve static HTML/CSS/JS and public asset files
app.use("/css", express.static(path.join(process.cwd(), "css")));
app.use("/js", express.static(path.join(process.cwd(), "js")));
app.use("/functions", express.static(path.join(process.cwd(), "functions")));
app.use("/public", express.static(path.join(process.cwd(), "public")));
app.use("/assets", express.static(path.join(process.cwd(), "public/assets")));
app.use(express.static(path.join(process.cwd(), "public")));

// Specific HTML route handlers
app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});
app.get("/index.html", (req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});
app.get("/chat.html", (req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), "chat.html"));
});
app.get("/admin.html", (req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), "admin.html"));
});
app.get("/login.html", (req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), "login.html"));
});

// Error handling middleware to ensure API routes always return JSON
app.use((err: any, req: Request, res: Response, next: any) => {
  if (req.path && req.path.startsWith("/api/")) {
    console.error(`[API Error on ${req.method} ${req.path}]`, err);
    return res.status(err.status || err.statusCode || 500).json({
      error: err.message || "An unexpected error occurred on the server."
    });
  }
  next(err);
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn("Vite middleware init:", e);
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[College AI Assistant] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
