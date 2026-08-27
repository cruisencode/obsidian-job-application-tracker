import { JobApplicationTrackerSettings, JobStatus } from "./types";

export const VIEW_TYPE_JOB_TRACKER = "job-application-tracker-view";

export const DEFAULT_STATUSES: JobStatus[] = [
	"Wishlist",
	"Applied",
	"Screening",
	"Interviewing",
	"Offer",
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

## 🏢 Company & Role Research
- **What they do:** 
- **Recent news / developments:** 
- **Key tech stack & tools:** 
- **Why this role is open / team mission:** 

---

## 🎯 Role Requirements & Alignment
- **Requirement 1:** *How my experience aligns...*
- **Requirement 2:** *How my experience aligns...*
- **Requirement 3:** *How my experience aligns...*

---

## 💡 STAR Stories & Behavioral Prep
### 1. Challenge / Conflict Resolution
- **Situation:** 
- **Task:** 
- **Action:** 
- **Result:** 

### 2. High Impact Project
- **Situation:** 
- **Task:** 
- **Action:** 
- **Result:** 

---

## ❓ Questions to Ask the Interviewer
1. What does success look like in the first 90 days for this role?
2. What are the biggest technical or organizational challenges currently facing the team?
3. How would you describe the team's engineering / work culture?
4. What are the next steps in the interview process?

---

## 📝 Post-Interview Notes & Reflection
- **How it went:** 
- **Questions asked:** 
- **Key takeaways / follow-up action items:** 
`;

export const DEFAULT_SETTINGS: JobApplicationTrackerSettings = {
	trackerFolderPath: "Job Applications",
	interviewNotesFolderPath: "Job Applications/Interviews",
	statuses: DEFAULT_STATUSES,
	defaultStatus: "Applied",
	interviewPrepTemplate: DEFAULT_INTERVIEW_PREP_TEMPLATE,
	defaultSourceOptions: DEFAULT_SOURCE_OPTIONS,
	openViewLocation: "tab",
};
