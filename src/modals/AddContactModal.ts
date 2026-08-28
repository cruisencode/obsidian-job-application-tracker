import { App, Modal, Notice, Setting, TFile } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { Contact, JobApplication } from "../types";
import { SelectApplicationModal } from "./UpdateStatusModal";

export class AddContactModal extends Modal {
	plugin: JobApplicationTrackerPlugin;
	application: JobApplication | null;

	name = "";
	role = "Recruiter";
	customRole = "";
	email = "";
	phone = "";
	linkedin = "";
	notes = "";

	constructor(app: App, plugin: JobApplicationTrackerPlugin, application: JobApplication | null = null) {
		super(app);
		this.plugin = plugin;
		this.application = application;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("job-tracker-modal");

		if (!this.application) {
			new SelectApplicationModal(this.app, this.plugin, (selectedApp) => {
				new AddContactModal(this.app, this.plugin, selectedApp).open();
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

		contentEl.createEl("h2", { text: `Add Contact: ${this.application.company}` });
		contentEl.createEl("p", {
			text: `${this.application.role}`,
			cls: "job-tracker-modal-subtitle",
		});

		// Contact Name
		new Setting(contentEl)
			.setName("Contact Name")
			.setDesc("Full name (required)")
			.addText((text) => {
				text.setPlaceholder("e.g. Alex Morgan").onChange((value) => {
					this.name = value;
				});
				text.inputEl.focus();
			});

		// Role Type
		new Setting(contentEl)
			.setName("Contact Role")
			.setDesc("Relationship or role in the hiring process")
			.addDropdown((dropdown) => {
				dropdown.addOption("Recruiter", "Recruiter");
				dropdown.addOption("Recruiting Coordinator", "Recruiting Coordinator");
				dropdown.addOption("Hiring Manager", "Hiring Manager");
				dropdown.addOption("Peer / Team Member", "Peer / Team Member");
				dropdown.addOption("Executive", "Executive");
				dropdown.addOption("Referrer", "Referrer");
				dropdown.addOption("Other", "Other (Custom)");
				dropdown.setValue(this.role);
				dropdown.onChange((value) => {
					this.role = value;
					this.renderModal();
				});
			});

		if (this.role === "Other") {
			new Setting(contentEl)
				.setName("Custom Role Name")
				.addText((text) =>
					text.setPlaceholder("e.g. Lead Architect").onChange((value) => {
						this.customRole = value;
					})
				);
		}

		// Email
		new Setting(contentEl)
			.setName("Email")
			.addText((text) =>
				text.setPlaceholder("alex.morgan@company.com").onChange((value) => {
					this.email = value;
				})
			);

		// Phone
		new Setting(contentEl)
			.setName("Phone Number")
			.addText((text) =>
				text.setPlaceholder("+1 (555) 000-0000").onChange((value) => {
					this.phone = value;
				})
			);

		// LinkedIn URL
		new Setting(contentEl)
			.setName("LinkedIn Profile")
			.addText((text) =>
				text.setPlaceholder("https://linkedin.com/in/...").onChange((value) => {
					this.linkedin = value;
				})
			);

		// Notes
		new Setting(contentEl)
			.setName("Notes")
			.setDesc("Conversation notes, time zone, personal details, etc.")
			.addTextArea((text) => {
				text.setPlaceholder("Notes...").onChange((value) => {
					this.notes = value;
				});
				text.inputEl.rows = 3;
			});

		// Submit button
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Add Contact")
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
		if (!this.name.trim()) {
			new Notice("Please enter a contact name.");
			return;
		}

		try {
			const resolvedRole = this.role === "Other" ? (this.customRole.trim() || "Other") : this.role;

			const contact: Contact = {
				id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
				name: this.name.trim(),
				role: resolvedRole,
				email: this.email.trim() || undefined,
				phone: this.phone.trim() || undefined,
				linkedin: this.linkedin.trim() || undefined,
				notes: this.notes.trim() || undefined,
			};

			const file = this.plugin.appService.resolveFile(this.application.filePath);
			if (file instanceof TFile) {
				await this.plugin.appService.addContactToApplication(file, contact);
				this.close();
			} else {
				new Notice("Application file could not be found. It may have been moved or deleted.");
			}
		} catch (err) {
			console.error("Job Tracker: Modal action failed:", err);
			new Notice(`Operation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
