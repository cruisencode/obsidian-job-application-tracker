# Job Application Tracker

An all-in-one job search management plugin for [Obsidian](https://obsidian.md). Track job applications, manage key contacts, schedule interviews, generate interview prep notes from customizable templates, attach and view job description PDFs/MD files in collapsible callouts, and visualize your search pipeline with Kanban, Table, List, and Metrics views.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Obsidian](https://img.shields.io/badge/Obsidian-v0.15.0%2B-purple.svg)

---

## ✨ Features

### 📊 Visual Dashboard with 4 View Modes
- **Kanban Board**: Drag-and-drop cards across pipeline stage columns (*Wishlist* ➔ *Applied* ➔ *Screening* ➔ *Interviewing* ➔ *Offer* ➔ *Accepted* / *Rejected* / *Withdrawn* / *Ghosted*). Moving cards instantly updates note frontmatter and logs timestamped status activity.
- **Table View**: Sortable columns (Company, Role, Status, Applied Date, Location, Salary, Source), clickable status badges, and quick action menus.
- **List View**: Compact card layout highlighting next scheduled interviews and key details.
- **Metrics & Conversion Analytics**:
  - **Sankey Pipeline Diagram**: Pure native SVG vector Sankey diagram charting the flow from application sources through screening and interview stages to final outcomes (zero external dependencies, zero permission prompts).
  - **Key KPI Cards**: Total Applications, Active Pipeline, Response Rate (%), Interview Rate (%), Offer Rate (%), Total Contacts, and Interview Rounds.
  - **Pipeline Stage Breakdown**: Real-time distribution and progress bars of applications currently sitting in each stage.
  - **Source Performance**: Breakdown analyzing which platforms yield the highest interview and offer conversion rates.
  - **Recent Activity Timeline**: Timestamped audit trail of recent status transitions across all applications.

### 📝 Native Markdown Notes & Data Storage
- Each application is saved as a Markdown note with clean YAML frontmatter in your designated applications folder (`Job Applications/` by default).
- Zero vendor lock-in; fully compatible with Obsidian Search, Dataview, and graph view.
- Automatically generated note sections:
  - 📋 **Overview**: Role, Salary, Location, Source, Job Posting link, Applied Date.
  - 👥 **Key Contacts**: Dynamic list of hiring managers, recruiters, coordinators.
  - 📅 **Interviews & Stages**: Chronological list of interview rounds linked to prep notes.
  - 📝 **Notes & Activity Log**: Timestamped audit trail of status updates and feedback.
  - 📄 **Job Description**: Native embedded PDF viewer or Markdown notes wrapped in default-collapsed callouts.

### 📎 Job Description PDF & Markdown Attachments
- **Upload or Link Files**: Attach PDFs or Markdown job postings directly from your local computer or link existing vault files when creating or editing an application.
- **Auto-Storage**: Automatically saved into your designated attachments folder (`Job Applications/Attachments/`).
- **Collapsible Callout Embedding**: Embedded inside notes with `> [!abstract]- 📎 Job Description (PDF)` so large files don't clutter your notes until you click to expand.
- **1-Click Badges**: Interactive badges on Kanban cards, Table rows, and List items open the attached PDF/MD file immediately.

### 👥 Contacts Management
- Track recruiters, recruiting coordinators, hiring managers, teammates, executives, or custom roles.
- Record email addresses (clickable `mailto:`), phone numbers, LinkedIn profiles, and conversation notes.
- Seamlessly updates note frontmatter and the markdown body in real time.

### 🎯 Interview Tracker & Prep Note Generator
- Schedule multiple rounds per application (*Recruiter Screen*, *Technical Screen*, *Hiring Manager*, *System Design*, *Coding Challenge*, *Behavioral*, *Onsite / Panel*, *Executive / Final*, *Other*).
- **Auto-Status Advancement**: Scheduling a new interview automatically advances the application status to **`Interviewing`** (for active early-stage applications in *Wishlist*, *Applied*, or *Screening*, while preserving finalized outcomes like *Accepted*, *Rejected*, *Withdrawn*, or *Ghosted*).
- **Automated Prep Note Generator**: Instantly generates a dedicated prep note based on an editable template containing:
  - 🏢 Company & Role Research
  - 🎯 Role Requirements & Alignment
  - 💡 STAR Behavioral Prep (Situation, Task, Action, Result)
  - ❓ Questions to Ask the Interviewer
  - 📝 Post-Interview Debrief & Reflection
- Automatically links prep notes inside the main application note and opens them for immediate prep.
- **Interview Debrief Modal**: Log interview outcomes (`Completed` or `Cancelled`), record debrief notes, and advance the application stage.

### 🔍 Live Search & Filtering
- Search across company names, roles, locations, sources, compensation, and contact names with instant, debounced results.
- Filter by specific application stages.

### ♿ Accessibility & Mobile Support
- **Full Keyboard Navigation**: Navigate view switcher tabs, Kanban cards, sortable Table headers, and status badges with <kbd>Tab</kbd>, <kbd>Enter</kbd>, and <kbd>Space</kbd>.
- **ARIA Standards**: Complete ARIA roles, `aria-selected`, and `aria-sort` indicators across all views.
- **Sidebar & Mobile Responsive**: Uses CSS Container Queries to seamlessly adapt layout when docked in sidebars or on mobile screens.

---

## 🚀 Getting Started

### Installation (Manual / Development)
1. Clone this repository into your Obsidian plugins folder, or symlink it:
   ```bash
   mkdir -p "/path/to/your/vault/.obsidian/plugins"
   ln -s "/path/to/obsidian-job-application-tracker" "/path/to/your/vault/.obsidian/plugins/job-application-tracker"
   ```
2. Build the plugin:
   ```bash
   cd obsidian-job-application-tracker
   npm install
   npm run build
   ```
3. In Obsidian, go to **Settings** ➔ **Community plugins**, turn off **Restricted mode**, and enable **Job Application Tracker**.

---

## ⌨️ Commands & Shortcuts

Open the Obsidian Command Palette (<kbd>Cmd</kbd> + <kbd>P</kbd> or <kbd>Ctrl</kbd> + <kbd>P</kbd>) to access:

| Command | Description |
| :--- | :--- |
| `Job Application Tracker: Open tracker dashboard` | Opens the dashboard in your preferred default location |
| `Job Application Tracker: Open tracker dashboard in Main Center Tab` | Opens full-width in the central workspace (recommended for Kanban) |
| `Job Application Tracker: Open tracker dashboard in Sidebar` | Opens compact view in the right sidebar |
| `Job Application Tracker: Add new job application` | Opens modal to create a new job application note & attach JD |
| `Job Application Tracker: Edit application details & attachments` | Edit application fields & attach/replace PDF/MD job descriptions |
| `Job Application Tracker: Update application status` | Fast status picker & activity log updater |
| `Job Application Tracker: Add contact to application` | Add recruiter/hiring manager info to an application |
| `Job Application Tracker: Add interview to application` | Schedule an interview round & create prep note |
| `Job Application Tracker: Log interview outcome / debrief` | Record debrief feedback and advance stage |
| `Job Application Tracker: Manage application (Contacts, Interviews & Details)` | Comprehensive overview & management modal |
| `Job Application Tracker: Delete application note` | Safely delete an application note and move to trash |

*Tip: When viewing any job application note, running these commands automatically pre-selects the active application.*

---

## ⚙️ Settings & Customization

Under **Settings** ➔ **Job Application Tracker**, you can configure:
- **Applications Folder**: Target folder where application notes are created (default: `Job Applications`).
- **Interview Notes Folder**: Subfolder for generated prep and debrief notes (default: `Job Applications/Interviews`).
- **Attachments Folder**: Subfolder where uploaded PDF and Markdown job descriptions are stored (default: `Job Applications/Attachments`).
- **Default View Location**: Main Tab (Center) or Sidebar when opening via ribbon icon or command.
- **Default Initial Status**: Default stage for new applications (default: `Applied`).
- **Application Sources**: Comma-separated list of sources (e.g. *LinkedIn, Referral, Company Website, Indeed, Wellfound, Otta*).
- **Interview Prep Note Template**: Full Markdown template supporting placeholders:
  - `{{company}}`
  - `{{role}}`
  - `{{roundName}}`
  - `{{date}}`
  - `{{time}}`
  - `{{interviewers}}`
  - `{{applicationNoteTitle}}`

---

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start watch mode (rebuilds automatically on changes)
npm run dev

# Production build
npm run build
```

---

## 📄 License

MIT © [cruisencode](https://github.com/cruisencode)
