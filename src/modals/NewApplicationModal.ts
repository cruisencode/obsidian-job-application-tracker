import { App, Modal, Setting } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { Contact, JobStatus } from "../types";

export class NewApplicationModal extends Modal {
	plugin: JobApplicationTrackerPlugin;

	company = "";
	role = "";
	status: JobStatus;
	dateApplied = "";
	location = "";
	salary = "";
	jobUrl = "";
	source = "";
	notes = "";
	recruiterName = "";
	recruiterEmail = "";

	constructor(app: App, plugin: JobApplicationTrackerPlugin) {
		super(app);
		this.plugin = plugin;
		this.status = plugin.settings.defaultStatus || "Applied";
		this.dateApplied = plugin.appService.getTodayDateString();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("job-tracker-modal");

		contentEl.createEl("h2", { text: "Add New Job Application" });

		// Company
		new Setting(contentEl)
			.setName("Company")
			.setDesc("Company name (required)")
			.addText((text) => {
				text.setPlaceholder("e.g. Acme Corp").onChange((value) => {
					this.company = value;
				});
				text.inputEl.focus();
			});

		// Role
		new Setting(contentEl)
			.setName("Role / Position")
			.setDesc("Job title (required)")
			.addText((text) =>
				text.setPlaceholder("e.g. Senior Software Engineer").onChange((value) => {
					this.role = value;
				})
			);

		// Status
		new Setting(contentEl)
			.setName("Status")
			.setDesc("Initial application stage")
			.addDropdown((dropdown) => {
				for (const st of this.plugin.settings.statuses) {
					dropdown.addOption(st, st);
				}
				dropdown.setValue(this.status);
				dropdown.onChange((value) => {
					this.status = value as JobStatus;
				});
			});

		// Date Applied
		new Setting(contentEl)
			.setName("Date Applied")
			.setDesc("Date of application (YYYY-MM-DD)")
			.addText((text) =>
				text.setValue(this.dateApplied).onChange((value) => {
					this.dateApplied = value;
				})
			);

		// Location
		new Setting(contentEl)
			.setName("Location")
			.setDesc("e.g. Remote, New York, NY, Hybrid")
			.addText((text) =>
				text.setPlaceholder("Remote").onChange((value) => {
					this.location = value;
				})
			);

		// Salary
		new Setting(contentEl)
			.setName("Salary / Compensation")
			.setDesc("e.g. $150k - $180k + equity")
			.addText((text) =>
				text.setPlaceholder("$150,000 - $180,000").onChange((value) => {
					this.salary = value;
				})
			);

		// Source
		new Setting(contentEl)
			.setName("Source")
			.setDesc("Where did you find this role?")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Select source...");
				for (const src of this.plugin.settings.defaultSourceOptions) {
					dropdown.addOption(src, src);
				}
				dropdown.onChange((value) => {
					this.source = value;
				});
			});

		// Job URL
		new Setting(contentEl)
			.setName("Job Posting URL")
			.setDesc("Link to job description or application portal")
			.addText((text) =>
				text.setPlaceholder("https://...").onChange((value) => {
					this.jobUrl = value;
				})
			);

		contentEl.createEl("h3", { text: "Recruiter / Contact (Optional)" });

		// Recruiter Contact
		new Setting(contentEl)
			.setName("Contact Name")
			.addText((text) =>
				text.setPlaceholder("e.g. Jane Doe").onChange((value) => {
					this.recruiterName = value;
				})
			);

		new Setting(contentEl)
			.setName("Contact Email")
			.addText((text) =>
				text.setPlaceholder("jane.doe@example.com").onChange((value) => {
					this.recruiterEmail = value;
				})
			);

		contentEl.createEl("h3", { text: "Initial Notes" });

		// Notes
		new Setting(contentEl)
			.setName("Notes")
			.setDesc("Any quick thoughts, referral name, or notes")
			.addTextArea((textArea) => {
				textArea.setPlaceholder("Notes...").onChange((value) => {
					this.notes = value;
				});
				textArea.inputEl.rows = 3;
			});

		// Action Buttons
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Create Application")
					.setCta()
					.onClick(async () => {
						await this.handleSubmit();
					})
			)
			.addButton((btn) =>
				btn.setButtonText("Cancel").onClick(() => {
					this.close();
				})
			);
	}

	async handleSubmit() {
		if (!this.company.trim() || !this.role.trim()) {
			alert("Please enter both a company name and a role.");
			return;
		}

		const contacts: Contact[] = [];
		if (this.recruiterName.trim()) {
			contacts.push({
				id: Date.now().toString(),
				name: this.recruiterName.trim(),
				role: "Recruiter",
				email: this.recruiterEmail.trim() || undefined,
			});
		}

		const file = await this.plugin.appService.createApplication({
			company: this.company.trim(),
			role: this.role.trim(),
			status: this.status,
			dateApplied: this.dateApplied.trim(),
			location: this.location.trim(),
			salary: this.salary.trim(),
			jobUrl: this.jobUrl.trim(),
			source: this.source.trim(),
			notes: this.notes.trim(),
			contacts: contacts,
		});

		this.close();

		// Open the newly created note in active workspace
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
