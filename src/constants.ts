import { JobApplicationTrackerSettings, JobStatus } from "./types";

export const VIEW_TYPE_JOB_TRACKER = "job-application-tracker-view";

export const DEFAULT_STATUSES: JobStatus[] = [
	"Wishlist",
	"Applied",
	"Screening",
	"Interviewing",
	"Offer",
	"Accepted",
	"Rejected",
	"Withdrawn",
	"Ghosted",
];

export const DEFAULT_SOURCE_OPTIONS: string[] = [
	"LinkedIn",
	"Company Website",
	"Referral",
	"Indeed",
	"Wellfound (AngelList)",
	"Otta",
	"Recruiter Reachout",
	"Other",
];

export const DEFAULT_INTERVIEW_PREP_TEMPLATE = `---
type: interview-prep
company: "{{company}}"
role: "{{role}}"
round: "{{roundName}}"
date: "{{date}}"
---

# Interview Prep: {{roundName}} - {{company}} ({{role}})

> **Date & Time:** {{date}} {{time}}  
> **Interviewers / Panel:** {{interviewers}}  
> **Application Note:** [[{{applicationNoteTitle}}]]

---

## 🏢 Company Intelligence & Team Context
- **Business Model / Mission:** 
- **Recent Product Launches & News:** 
- **Tech Stack & Engineering Architecture:** 
- **Team Scope & Why This Role is Open:** 

---

## 🎯 Key Strengths & Role Alignment
- **Must-Have Requirement 1:** *How my background directly aligns...*
- **Must-Have Requirement 2:** *How my background directly aligns...*
- **Domain Expertise & Impact:** *Relevant past wins...*

---

## 💡 STAR Stories & Key Scenarios
### 1. Complex Technical / Cross-functional Challenge
- **Situation:** 
- **Task:** 
- **Action:** 
- **Result & Metric:** 

### 2. High-Impact Delivery / Innovation Win
- **Situation:** 
- **Task:** 
- **Action:** 
- **Result & Metric:** 

---

## 🛠️ Technical & Architecture Focus Areas
- **Core Topics to Review:** 
- **Potential Deep-Dive Scenarios:** 
- **Key Concepts / Code Examples:** 

---

## 💰 Compensation & Target Range
- **Target Base / Total Comp:** 
- **Notes on Benefits & Equity:** 

---

## ❓ Tailored Questions for the Interviewer
### For Hiring Manager / Engineering Lead:
1. What does outstanding success look like in the first 90 days for this position?
2. What are the highest-priority architectural or product roadblocks currently facing the team?
3. How do you measure impact and growth within this group?

### For Peer Engineers / Teammates:
1. What does your day-to-day deployment and collaboration workflow look like?
2. What is the most exciting technical problem the team solved recently?

### For Recruiter / Talent Team:
1. What does the remainder of the evaluation pipeline and timeline look like?

---

## 📝 Post-Interview Debrief & Action Items
- **Overall Impressions & Sentiment:** 
- **What Went Well:** 
- **Areas to Improve / Follow Up On:** 
- **Follow-up / Thank You Sent:** [ ] Yes  [ ] No
`;

export const DEFAULT_SETTINGS: JobApplicationTrackerSettings = {
	trackerFolderPath: "Job Applications",
	interviewNotesFolderPath: "Job Applications/Interviews",
	attachmentsFolderPath: "Job Applications/Attachments",
	statuses: DEFAULT_STATUSES,
	defaultStatus: "Applied",
	interviewPrepTemplate: DEFAULT_INTERVIEW_PREP_TEMPLATE,
	defaultSourceOptions: DEFAULT_SOURCE_OPTIONS,
	openViewLocation: "tab",
};
