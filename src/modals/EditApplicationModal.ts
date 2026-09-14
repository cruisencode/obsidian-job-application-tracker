import { App, ButtonComponent, Notice, Setting } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { EmploymentType, JobApplication, JobStatus, WorkplaceType } from "../types";
import { sanitizeUrl } from "../services/ApplicationService";
import { EMPLOYMENT_OPTIONS, WORKPLACE_OPTIONS } from "../constants";
import { BaseApplicationModal } from "./BaseApplicationModal";

/**
 * Comprehensive modal dialog to edit an existing job application.
 */
export class EditApplicationModal extends BaseApplicationModal {
	private onComplete?: () => void;

	private company = "";
	private role = "";
	private status: JobStatus = "Applied";
	private dateApplied = "";
	private location = "";
	private workplaceType: WorkplaceType | "" = "";
	private employmentType: EmploymentType | "" = "";
	private salary = "";
	private jobUrl = "";
	private source = "";
	private followUpDate = "";
	private jobDescriptionFile = "";
	private uploadedFile: File | null = null;
	private newJobDescriptionText = "";

	private companyInputEl: HTMLInputElement | null = null;
	private roleInputEl: HTMLInputElement | null = null;

	constructor(
		app: App,
		plugin: JobApplicationTrackerPlugin,
		application: JobApplication | null = null,
		onComplete?: () => void
	) {
		super(app, plugin, application);
		this.onComplete = onComplete;

		if (application) {
			this.syncFieldsFromApplication(application);
		} else {
			this.status = plugin.settings.defaultStatus || "Applied";
		}
	}

	private syncFieldsFromApplication(app: JobApplication): void {
		this.company = app.company;
		this.role = app.role;
		this.status = app.status;
		this.dateApplied = app.dateApplied;
		this.location = app.location || "";
		this.workplaceType = app.workplaceType || "";
		this.employmentType = app.employmentType || "";
		this.salary = app.salary || "";
		this.jobUrl = app.jobUrl || "";
		this.source = app.source || "";
		this.followUpDate = app.followUpDate || "";
		this.jobDescriptionFile = app.jobDescriptionFile || "";
	}

	renderContent(): void {
		const { contentEl } = this;
		contentEl.empty();

		if (!this.application) return;

		// Ensure fields reflect the current application if switched
		if (!this.company && this.application) {
			this.syncFieldsFromApplication(this.application);
		}

		contentEl.createEl("h2", { text: `Edit Details: ${this.application.company}` });
		contentEl.createEl("p", {
			text: `${this.application.role}`,
			cls: "job-tracker-modal-subtitle",
		});

		// Company
		new Setting(contentEl)
			.setName("Company")
			.setDesc("Company name (required)")
			.addText((text) => {
				this.companyInputEl = text.inputEl;
				text.inputEl.maxLength = 100;
				text.setValue(this.company).onChange((value) => {
					this.company = value;
				});
			});

		// Role
		new Setting(contentEl)
			.setName("Role / Position")
			.setDesc("Job title (required)")
			.addText((text) => {
				this.roleInputEl = text.inputEl;
				text.inputEl.maxLength = 150;
				text.setValue(this.role).onChange((value) => {
					this.role = value;
				});
			});

		// Status
		new Setting(contentEl)
			.setName("Status")
			.addDropdown((dropdown) => {
				for (const st of this.plugin.settings.statuses) {
					dropdown.addOption(st, st);
				}
				dropdown.setValue(this.status);
				dropdown.onChange((value) => {
					this.status = value;
				});
			});

		// Date Applied
		new Setting(contentEl)
			.setName("Date Applied")
			.addText((text) => {
				text.inputEl.maxLength = 20;
				text.setValue(this.dateApplied).onChange((value) => {
					this.dateApplied = value;
				});
			});

		// Location
		new Setting(contentEl)
			.setName("Location")
			.addText((text) => {
				text.inputEl.maxLength = 150;
				text.setValue(this.location).onChange((value) => {
					this.location = value;
				});
			});

		// Workplace Model
		new Setting(contentEl)
			.setName("Workplace Model")
			.setDesc("Work arrangement model")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Select model...");
				for (const option of WORKPLACE_OPTIONS) {
					dropdown.addOption(option, option);
				}
				dropdown.setValue(this.workplaceType);
				dropdown.onChange((value) => {
					this.workplaceType = value as WorkplaceType | "";
				});
			});

		// Employment Type
		new Setting(contentEl)
			.setName("Employment Type")
			.setDesc("Job engagement type")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Select type...");
				for (const option of EMPLOYMENT_OPTIONS) {
					dropdown.addOption(option, option);
				}
				dropdown.setValue(this.employmentType);
				dropdown.onChange((value) => {
					this.employmentType = value as EmploymentType | "";
				});
			});

		// Salary
		new Setting(contentEl)
			.setName("Salary / Target Comp")
			.setDesc("e.g. $140k - $160k, £85k")
			.addText((text) => {
				text.inputEl.maxLength = 100;
				text.setValue(this.salary).onChange((value) => {
					this.salary = value;
				});
			});

		// Job URL
		new Setting(contentEl)
			.setName("Job Posting URL")
			.setDesc("Link to active listing")
			.addText((text) => {
				text.inputEl.maxLength = 500;
				text.setValue(this.jobUrl).onChange((value) => {
					this.jobUrl = value;
				});
			});

		// Source
		new Setting(contentEl)
			.setName("Source")
			.setDesc("Where did you find this role?")
			.addDropdown((dropdown) => {
				for (const src of this.plugin.settings.defaultSourceOptions) {
					dropdown.addOption(src, src);
				}
				dropdown.setValue(this.source || this.plugin.settings.defaultSourceOptions[0]);
				dropdown.onChange((value) => {
					this.source = value;
				});
			});

		// Follow-up Date
		new Setting(contentEl)
			.setName("Follow-up / Deadline Date")
			.setDesc("Optional reminder date (YYYY-MM-DD)")
			.addText((text) => {
				text.inputEl.maxLength = 20;
				text.setValue(this.followUpDate).onChange((value) => {
					this.followUpDate = value;
				});
			});

		// Job Description Attachment Section
		contentEl.createEl("h3", { text: "Job Description" });

		if (this.jobDescriptionFile) {
			new Setting(contentEl)
				.setName("Current Attachment")
				.setDesc(this.jobDescriptionFile)
				.addButton((btn) =>
					btn.setButtonText("Remove File").onClick(() => {
						this.jobDescriptionFile = "";
						this.renderContent();
					})
				);
		} else {
			new Setting(contentEl)
				.setName("Attach Job Description File")
				.setDesc("Upload a PDF or Markdown job spec")
				.then((setting) => {
					const input = setting.controlEl.createEl("input", {
						type: "file",
						cls: "job-tracker-file-input",
						attr: { accept: ".pdf,.md,.txt" },
					});
					input.onchange = () => {
						if (input.files && input.files[0]) {
							this.uploadedFile = input.files[0];
							new Notice(`Attached file: ${this.uploadedFile.name}`);
						}
					};
				});
		}

		// Or paste new JD text
		new Setting(contentEl)
			.setName("Update JD Text")
			.setDesc("Append or overwrite markdown text in ## Job Description section")
			.addTextArea((text) => {
				text.inputEl.maxLength = 10000;
				text
					.setPlaceholder("Paste updated requirements here...")
					.setValue(this.newJobDescriptionText)
					.onChange((value) => {
						this.newJobDescriptionText = value;
					});
				text.inputEl.rows = 4;
			});

		// Submit button
		let submitBtn: ButtonComponent;
		new Setting(contentEl)
			.addButton((btn) => {
				submitBtn = btn;
				btn
					.setButtonText("Save Changes")
					.setCta()
					.onClick(async () => {
						submitBtn.setDisabled(true);
						await this.handleSubmit(submitBtn);
					});
			})
			.addButton((btn) =>
				btn.setButtonText("Cancel").onClick(() => {
					this.close();
				})
			);
	}

	private async handleSubmit(btn?: ButtonComponent): Promise<void> {
		if (!this.application) return;

		try {
			if (!this.company.trim()) {
				new Notice("Please enter a company name.");
				this.companyInputEl?.focus();
				return;
			}
			if (!this.role.trim()) {
				new Notice("Please enter a role / job title.");
				this.roleInputEl?.focus();
				return;
			}
			if (this.dateApplied.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(this.dateApplied.trim())) {
				new Notice("Date Applied must be in YYYY-MM-DD format.");
				return;
			}
			if (this.followUpDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(this.followUpDate.trim())) {
				new Notice("Follow-up Date must be in YYYY-MM-DD format.");
				return;
			}
			if (this.jobUrl.trim() && !sanitizeUrl(this.jobUrl.trim())) {
				new Notice("Job URL must begin with http:// or https://");
				return;
			}

			let finalAttachmentPath = this.jobDescriptionFile;
			if (this.uploadedFile) {
				const saved = await this.plugin.appService.saveAttachment(
					this.uploadedFile,
					`${this.company.trim()} - ${this.role.trim()}`
				);
				finalAttachmentPath = saved.path;
			}

			const file = this.resolveApplicationFile();
			if (!file) {
				return;
			}

			await this.plugin.appService.updateApplicationDetails(
				file,
				{
					company: this.company.trim(),
					role: this.role.trim(),
					status: this.status,
					dateApplied: this.dateApplied.trim(),
					location: this.location.trim(),
					workplaceType: this.workplaceType || undefined,
					employmentType: this.employmentType || undefined,
					salary: this.salary.trim(),
					jobUrl: this.jobUrl.trim(),
					source: this.source.trim(),
					followUpDate: this.followUpDate.trim() || undefined,
					jobDescriptionFile: finalAttachmentPath || undefined,
				},
				this.newJobDescriptionText ? this.newJobDescriptionText.trim() : undefined
			);

			// Rename file if company or role changed and target name is available
			const newBaseName = this.plugin.appService.sanitizeFileName(`${this.company.trim()} - ${this.role.trim()}`);
			if (newBaseName && file.basename !== newBaseName) {
				const parentDir = file.parent ? file.parent.path : "";
				const newPath = parentDir && parentDir !== "/" ? `${parentDir}/${newBaseName}.md` : `${newBaseName}.md`;
				if (this.app.vault.getAbstractFileByPath(newPath) == null) {
					await this.app.fileManager.renameFile(file, newPath);
				}
			}

			this.close();
			if (this.onComplete) {
				this.onComplete();
			}
		} catch (err) {
			this.handleModalError("Save application", err);
		} finally {
			btn?.setDisabled(false);
		}
	}
}
