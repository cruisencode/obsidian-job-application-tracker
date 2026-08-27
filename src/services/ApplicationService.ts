import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import { Contact, InterviewRound, JobApplication, JobStatus, StatusHistoryEntry } from "../types";
import JobApplicationTrackerPlugin from "../main";

export class ApplicationService {
	app: App;
	plugin: JobApplicationTrackerPlugin;

	constructor(app: App, plugin: JobApplicationTrackerPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * Ensure that a folder exists in the vault, creating parent directories if needed.
	 */
	async ensureFolder(folderPath: string): Promise<TFolder> {
		const normalized = normalizePath(folderPath.trim());
		if (!normalized || normalized === "/" || normalized === ".") {
			return this.app.vault.getRoot();
		}

		const folder = this.app.vault.getAbstractFileByPath(normalized);
		if (folder instanceof TFolder) {
			return folder;
		}

		// Ensure parent folder exists first
		const parentPath = normalized.substring(0, normalized.lastIndexOf("/"));
		if (parentPath) {
			await this.ensureFolder(parentPath);
		}

		return await this.app.vault.createFolder(normalized);
	}

	/**
	 * Sanitizes a string so it can safely be used as a markdown filename in Obsidian.
	 */
	sanitizeFileName(name: string): string {
		return name
			.replace(/[\\/:*?"<>|#^\[\]]/g, "-")
			.replace(/\s+/g, " ")
			.trim();
	}

	/**
	 * Formats today's date in YYYY-MM-DD format.
	 */
	getTodayDateString(): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	/**
	 * Generates markdown body content for a newly created application.
	 */
	generateNoteContent(appData: Partial<JobApplication>): string {
		const today = this.getTodayDateString();
		const company = appData.company || "Company";
		const role = appData.role || "Role";

		let body = `# ${company} - ${role}\n\n`;

		body += `## 📋 Overview\n`;
		if (appData.salary) body += `- **Salary / Comp:** ${appData.salary}\n`;
		if (appData.location) body += `- **Location:** ${appData.location}\n`;
		if (appData.source) body += `- **Source:** ${appData.source}\n`;
		if (appData.jobUrl) body += `- **Job Posting:** [Link](${appData.jobUrl})\n`;
		body += `- **Applied Date:** ${appData.dateApplied || today}\n\n`;

		body += `## 👥 Key Contacts\n`;
		if (appData.contacts && appData.contacts.length > 0) {
			for (const c of appData.contacts) {
				body += `- **${c.name}** (${c.role})${c.email ? ` - [${c.email}](mailto:${c.email})` : ""}${c.phone ? ` - ${c.phone}` : ""}${c.notes ? `\n  - *Notes:* ${c.notes}` : ""}\n`;
			}
		} else {
			body += `*No contacts added yet.*\n`;
		}
		body += `\n`;

		body += `## 📅 Interviews & Stages\n`;
		if (appData.interviews && appData.interviews.length > 0) {
			for (const iv of appData.interviews) {
				const prepLink = iv.prepNotePath ? ` - [[${iv.prepNotePath}|Prep Note]]` : "";
				body += `- **${iv.roundName}** (${iv.status}) - ${iv.date || "TBD"} ${iv.time || ""}${prepLink}\n`;
			}
		} else {
			body += `*No interviews scheduled yet.*\n`;
		}
		body += `\n`;

		body += `## 📝 Notes & Activity Log\n`;
		if (appData.notes) {
			body += `- **${today}**: ${appData.notes}\n`;
		} else {
			body += `- **${today}**: Application created (Status: ${appData.status || "Applied"})\n`;
		}
		body += `\n`;

		body += `## 📄 Job Description\n`;
		if (appData.jobDescription) {
			body += `${appData.jobDescription}\n`;
		} else {
			body += `*Paste job description or requirements here...*\n`;
		}

		return body;
	}

	/**
	 * Creates a new job application markdown file with frontmatter and structured body.
	 */
	async createApplication(data: {
		company: string;
		role: string;
		status?: JobStatus;
		dateApplied?: string;
		location?: string;
		salary?: string;
		jobUrl?: string;
		source?: string;
		notes?: string;
		jobDescription?: string;
		contacts?: Contact[];
	}): Promise<TFile> {
		const folderPath = this.plugin.settings.trackerFolderPath;
		await this.ensureFolder(folderPath);

		const today = this.getTodayDateString();
		const status = data.status || this.plugin.settings.defaultStatus || "Applied";
		const dateApplied = data.dateApplied || today;

		const baseFileName = this.sanitizeFileName(`${data.company} - ${data.role}`);
		let filePath = `${normalizePath(folderPath)}/${baseFileName}.md`;
		let counter = 1;

		while (this.app.vault.getAbstractFileByPath(filePath) != null) {
			filePath = `${normalizePath(folderPath)}/${baseFileName} (${counter}).md`;
			counter++;
		}

		const initialStatusHistory: StatusHistoryEntry[] = [
			{
				status: status,
				date: today,
				note: data.notes || "Application created",
			},
		];

		const frontmatterObj: Record<string, any> = {
			type: "job-application",
			company: data.company,
			role: data.role,
			status: status,
			dateApplied: dateApplied,
			lastUpdated: today,
			location: data.location || "",
			salary: data.salary || "",
			jobUrl: data.jobUrl || "",
			source: data.source || "",
			tags: ["job-application"],
			contacts: data.contacts || [],
			interviews: [],
			statusHistory: initialStatusHistory,
		};

		const yamlLines = ["---"];
		for (const [key, value] of Object.entries(frontmatterObj)) {
			yamlLines.push(`${key}: ${JSON.stringify(value)}`);
		}
		yamlLines.push("---", "");

		const body = this.generateNoteContent({
			...data,
			status,
			dateApplied,
		});

		const fullContent = `${yamlLines.join("\n")}\n${body}`;
		const file = await this.app.vault.create(filePath, fullContent);
		new Notice(`Created application: ${data.company} - ${data.role}`);
		return file;
	}

	/**
	 * Parse a TFile into a typed JobApplication object.
	 */
	getApplicationFromCache(file: TFile): JobApplication | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;

		if (!frontmatter || (frontmatter.type !== "job-application" && !frontmatter.company)) {
			return null;
		}

		return {
			filePath: file.path,
			company: frontmatter.company || file.basename.split(" - ")[0] || "Unknown Company",
			role: frontmatter.role || file.basename.split(" - ")[1] || "Unknown Role",
			status: frontmatter.status || "Applied",
			dateApplied: frontmatter.dateApplied || "",
			lastUpdated: frontmatter.lastUpdated || "",
			location: frontmatter.location || "",
			salary: frontmatter.salary || "",
			jobUrl: frontmatter.jobUrl || "",
			source: frontmatter.source || "",
			contacts: Array.isArray(frontmatter.contacts) ? frontmatter.contacts : [],
			interviews: Array.isArray(frontmatter.interviews) ? frontmatter.interviews : [],
			statusHistory: Array.isArray(frontmatter.statusHistory) ? frontmatter.statusHistory : [],
			tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
		};
	}

	/**
	 * Get all job applications in the vault.
	 */
	async getAllApplications(): Promise<JobApplication[]> {
		const files = this.app.vault.getMarkdownFiles();
		const applications: JobApplication[] = [];
		const folderPrefix = normalizePath(this.plugin.settings.trackerFolderPath);

		for (const file of files) {
			const isInFolder = file.path.startsWith(folderPrefix + "/") || file.path.startsWith(folderPrefix);
			const cache = this.app.metadataCache.getFileCache(file);
			const isJobAppType = cache?.frontmatter?.type === "job-application";

			if (isInFolder || isJobAppType) {
				const appData = this.getApplicationFromCache(file);
				if (appData) {
					applications.push(appData);
				}
			}
		}

		// Sort by last updated / date applied descending
		return applications.sort((a, b) => {
			const dateA = a.lastUpdated || a.dateApplied || "";
			const dateB = b.lastUpdated || b.dateApplied || "";
			return dateB.localeCompare(dateA);
		});
	}

	/**
	 * Updates the status of an application note, appending to statusHistory and activity log.
	 */
	async updateStatus(file: TFile, newStatus: JobStatus, note?: string): Promise<void> {
		const today = this.getTodayDateString();

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.status = newStatus;
			fm.lastUpdated = today;

			if (!Array.isArray(fm.statusHistory)) {
				fm.statusHistory = [];
			}

			fm.statusHistory.push({
				status: newStatus,
				date: today,
				note: note || `Status updated to ${newStatus}`,
			});
		});

		// If a note was provided, append it to the Notes & Activity Log section in the markdown
		if (note) {
			const content = await this.app.vault.read(file);
			const logHeader = "## 📝 Notes & Activity Log";
			if (content.includes(logHeader)) {
				const insertion = `\n- **${today}** (${newStatus}): ${note}`;
				const updatedContent = content.replace(logHeader, `${logHeader}${insertion}`);
				await this.app.vault.modify(file, updatedContent);
			}
		}

		new Notice(`Updated status to "${newStatus}" for ${file.basename}`);
	}

	/**
	 * Update general application frontmatter fields.
	 */
	async updateApplicationFields(file: TFile, fields: Partial<JobApplication>): Promise<void> {
		const today = this.getTodayDateString();

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (fields.company !== undefined) fm.company = fields.company;
			if (fields.role !== undefined) fm.role = fields.role;
			if (fields.status !== undefined) fm.status = fields.status;
			if (fields.location !== undefined) fm.location = fields.location;
			if (fields.salary !== undefined) fm.salary = fields.salary;
			if (fields.jobUrl !== undefined) fm.jobUrl = fields.jobUrl;
			if (fields.source !== undefined) fm.source = fields.source;
			if (fields.dateApplied !== undefined) fm.dateApplied = fields.dateApplied;
			if (fields.contacts !== undefined) fm.contacts = fields.contacts;
			if (fields.interviews !== undefined) fm.interviews = fields.interviews;
			fm.lastUpdated = today;
		});
	}
}
