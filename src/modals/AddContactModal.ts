import { App, ButtonComponent, Notice, Setting } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { Contact, JobApplication } from "../types";
import { sanitizeEmail, sanitizeUrl } from "../services/ApplicationService";
import { BaseApplicationModal } from "./BaseApplicationModal";

/**
 * Modal dialog to add a key contact (recruiter, hiring manager, etc.) to a job application.
 */
export class AddContactModal extends BaseApplicationModal {
	private onComplete?: () => void;
	private name = "";
	private role = "Recruiter";
	private customRole = "";
	private email = "";
	private phone = "";
	private linkedin = "";
	private notes = "";

	constructor(
		app: App,
		plugin: JobApplicationTrackerPlugin,
		application: JobApplication | null = null,
		onComplete?: () => void
	) {
		super(app, plugin, application);
		this.onComplete = onComplete;
	}

	renderContent(): void {
		const { contentEl } = this;
		contentEl.empty();

		if (!this.application) return;

		contentEl.createEl("h2", { text: `Add Contact: ${this.application.company}` });
		contentEl.createEl("p", {
			text: `Role: ${this.application.role}`,
			cls: "job-tracker-modal-subtitle",
		});

		// Contact Name
		new Setting(contentEl)
			.setName("Contact Name")
			.setDesc("Full name of the contact")
			.addText((text) => {
				text.inputEl.maxLength = 100;
				text
					.setPlaceholder("e.g. Jane Doe")
					.setValue(this.name)
					.onChange((value) => {
						this.name = value;
					});
				text.inputEl.focus();
			});

		// Contact Role Dropdown
		new Setting(contentEl)
			.setName("Role / Relationship")
			.setDesc("What is this person's role in the hiring process?")
			.addDropdown((dropdown) => {
				const roles = [
					"Recruiter",
					"Hiring Manager",
					"Sourcer",
					"Interviewer",
					"Referral / Connection",
					"Peer / Team Member",
					"HR / People Ops",
					"Executive / VP",
					"Other",
				];
				for (const r of roles) {
					dropdown.addOption(r, r);
				}
				dropdown.setValue(this.role);
				dropdown.onChange((value) => {
					this.role = value;
					this.renderContent();
				});
			});

		// Custom role input if "Other" is chosen
		if (this.role === "Other") {
			new Setting(contentEl)
				.setName("Custom Role Description")
				.addText((text) => {
					text.inputEl.maxLength = 100;
					text
						.setPlaceholder("e.g. Future Teammate")
						.setValue(this.customRole)
						.onChange((val) => {
							this.customRole = val;
						});
				});
		}

		// Email
		new Setting(contentEl)
			.setName("Email Address")
			.addText((text) => {
				text.inputEl.maxLength = 100;
				text.setPlaceholder("jane@company.com").setValue(this.email).onChange((value) => {
					this.email = value;
				});
			});

		// Phone
		new Setting(contentEl)
			.setName("Phone Number")
			.addText((text) => {
				text.inputEl.maxLength = 50;
				text.setPlaceholder("+1 (555) 000-0000").setValue(this.phone).onChange((value) => {
					this.phone = value;
				});
			});

		// LinkedIn
		new Setting(contentEl)
			.setName("LinkedIn Profile")
			.addText((text) => {
				text.inputEl.maxLength = 500;
				text.setPlaceholder("https://linkedin.com/in/...").setValue(this.linkedin).onChange((value) => {
					this.linkedin = value;
				});
			});

		// Notes
		new Setting(contentEl)
			.setName("Notes")
			.setDesc("Conversation notes, time zone, personal details, etc.")
			.addTextArea((text) => {
				text.inputEl.maxLength = 2000;
				text.setPlaceholder("Notes...").setValue(this.notes).onChange((value) => {
					this.notes = value;
				});
				text.inputEl.rows = 3;
			});

		// Submit button
		let submitBtn: ButtonComponent;
		new Setting(contentEl)
			.addButton((btn) => {
				submitBtn = btn;
				btn
					.setButtonText("Add Contact")
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
		if (!this.name.trim()) {
			new Notice("Please enter a contact name.");
			btn?.setDisabled(false);
			return;
		}
		if (this.email.trim() && !sanitizeEmail(this.email.trim())) {
			new Notice("Please enter a valid email address.");
			btn?.setDisabled(false);
			return;
		}
		if (this.linkedin.trim() && !sanitizeUrl(this.linkedin.trim())) {
			new Notice("LinkedIn URL must begin with http:// or https://");
			btn?.setDisabled(false);
			return;
		}

		try {
			const resolvedRole = this.role === "Other" ? (this.customRole.trim() || "Other") : this.role;

			const contact: Contact = {
				id: crypto.randomUUID(),
				name: this.name.trim(),
				role: resolvedRole,
				email: this.email.trim() || undefined,
				phone: this.phone.trim() || undefined,
				linkedin: this.linkedin.trim() || undefined,
				notes: this.notes.trim() || undefined,
			};

			const file = this.resolveApplicationFile();
			if (!file) {
				btn?.setDisabled(false);
				return;
			}

			await this.plugin.appService.addContactToApplication(file, contact);
			this.close();
			if (this.onComplete) {
				this.onComplete();
			}
		} catch (err) {
			btn?.setDisabled(false);
			this.handleModalError("Add contact", err);
		}
	}
}
