import { App, Modal, Setting, TFile } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { JobApplication, JobStatus } from "../types";
import { SelectApplicationModal } from "./UpdateStatusModal";

export class EditApplicationModal extends Modal {
	plugin: JobApplicationTrackerPlugin;
	application: JobApplication | null;

	company = "";
	role = "";
	status: JobStatus;
	dateApplied = "";
	location = "";
	salary = "";
	jobUrl = "";
	source = "";
	jobDescriptionFile = "";
	uploadedFile: File | null = null;
	newJobDescriptionText = "";

	constructor(app: App, plugin: JobApplicationTrackerPlugin, application: JobApplication | null = null) {
		super(app);
		this.plugin = plugin;
		this.application = application;
		if (application) {
			this.company = application.company;
			this.role = application.role;
			this.status = application.status;
			this.dateApplied = application.dateApplied;
			this.location = application.location || "";
			this.salary = application.salary || "";
			this.jobUrl = application.jobUrl || "";
			this.source = application.source || "";
			this.jobDescriptionFile = application.jobDescriptionFile || "";
		} else {
			this.status = plugin.settings.defaultStatus || "Applied";
		}
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("job-tracker-modal");

		if (!this.application) {
			new SelectApplicationModal(this.app, this.plugin, (selectedApp) => {
				this.application = selectedApp;
				this.company = selectedApp.company;
				this.role = selectedApp.role;
				this.status = selectedApp.status;
				this.dateApplied = selectedApp.dateApplied;
				this.location = selectedApp.location || "";
				this.salary = selectedApp.salary || "";
				this.jobUrl = selectedApp.jobUrl || "";
				this.source = selectedApp.source || "";
				this.jobDescriptionFile = selectedApp.jobDescriptionFile || "";
				this.renderModal();
			}).open();
			this.close();
			return;
		}

		this.renderModal();
	}

	renderModal() {
		const { contentEl } = this;
		contentEl.empty();

		if (!this.application) return;

		contentEl.createEl("h2", { text: `Edit Details: ${this.application.company}` });
		contentEl.createEl("p", {
			text: `${this.application.role}`,
			cls: "job-tracker-modal-subtitle",
		});

		// Company
		new Setting(contentEl)
			.setName("Company")
			.addText((text) =>
				text.setValue(this.company).onChange((value) => {
					this.company = value;
				})
			);

		// Role
		new Setting(contentEl)
			.setName("Role / Position")
			.addText((text) =>
				text.setValue(this.role).onChange((value) => {
					this.role = value;
				})
			);

		// Status
		new Setting(contentEl)
			.setName("Status")
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
			.addText((text) =>
				text.setValue(this.dateApplied).onChange((value) => {
					this.dateApplied = value;
				})
			);

		// Location
		new Setting(contentEl)
			.setName("Location")
			.addText((text) =>
				text.setValue(this.location).onChange((value) => {
					this.location = value;
				})
			);

		// Salary
		new Setting(contentEl)
			.setName("Salary / Compensation")
			.addText((text) =>
				text.setValue(this.salary).onChange((value) => {
					this.salary = value;
				})
			);

		// Source
		new Setting(contentEl)
			.setName("Source")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Select source...");
				for (const src of this.plugin.settings.defaultSourceOptions) {
					dropdown.addOption(src, src);
				}
				dropdown.setValue(this.source);
				dropdown.onChange((value) => {
					this.source = value;
				});
			});

		// Job URL
		new Setting(contentEl)
			.setName("Job Posting URL")
			.addText((text) =>
				text.setValue(this.jobUrl).onChange((value) => {
					this.jobUrl = value;
				})
			);

		// Attachments section
		contentEl.createEl("h3", { text: "Job Description Attachment" });

		if (this.jobDescriptionFile) {
			const attachedInfo = contentEl.createDiv({ cls: "job-tracker-attached-info" });
			attachedInfo.createSpan({ text: `Currently attached: ` });
			attachedInfo.createEl("strong", { text: this.jobDescriptionFile });
		}

		// Upload new PDF or Markdown file
		const uploadSetting = new Setting(contentEl)
			.setName("Upload New Attachment (PDF / MD)")
			.setDesc("Replaces current attachment with a newly uploaded file");

		const fileInput = uploadSetting.controlEl.createEl("input", {
			type: "file",
			attr: { accept: ".pdf,.md,.txt" },
			cls: "job-tracker-file-input",
		});
		fileInput.onchange = () => {
			if (fileInput.files && fileInput.files.length > 0) {
				this.uploadedFile = fileInput.files[0];
			}
		};

		// Link existing vault path
		new Setting(contentEl)
			.setName("Or Link Existing Vault File Path")
			.addText((text) =>
				text.setValue(this.jobDescriptionFile).onChange((value) => {
					this.jobDescriptionFile = value.trim();
				})
			);

		// Update Job Description text
		new Setting(contentEl)
			.setName("Update Job Description Text")
			.setDesc("Optional markdown or text description")
			.addTextArea((textArea) => {
				textArea.setPlaceholder("Paste or edit job description...").onChange((value) => {
					this.newJobDescriptionText = value;
				});
				textArea.inputEl.rows = 4;
			});

		// Action Buttons
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Save Changes")
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
		if (!this.application) return;

		let finalAttachmentPath = this.jobDescriptionFile;
		if (this.uploadedFile) {
			const saved = await this.plugin.appService.saveAttachment(
				this.uploadedFile,
				`${this.company.trim()} - ${this.role.trim()}`
			);
			finalAttachmentPath = saved.path;
		}

		const file = this.app.vault.getAbstractFileByPath(this.application.filePath);
		if (file instanceof TFile) {
			await this.plugin.appService.updateApplicationDetails(
				file,
				{
					company: this.company.trim(),
					role: this.role.trim(),
					status: this.status,
					dateApplied: this.dateApplied.trim(),
					location: this.location.trim(),
					salary: this.salary.trim(),
					jobUrl: this.jobUrl.trim(),
					source: this.source.trim(),
					jobDescriptionFile: finalAttachmentPath || undefined,
				},
				this.newJobDescriptionText ? this.newJobDescriptionText.trim() : undefined
			);
		}

		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
