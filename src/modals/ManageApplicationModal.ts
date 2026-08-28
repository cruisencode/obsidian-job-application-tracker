import { App, Modal, Notice, Setting, TFile, setIcon } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { JobApplication } from "../types";
import { SelectApplicationModal } from "./UpdateStatusModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { AddContactModal } from "./AddContactModal";
import { AddInterviewModal } from "./AddInterviewModal";
import { LogInterviewOutcomeModal } from "./LogInterviewOutcomeModal";

/**
 * Comprehensive management modal for viewing and managing an application's overview, contacts, and interview rounds.
 */
export class ManageApplicationModal extends Modal {
	plugin: JobApplicationTrackerPlugin;
	application: JobApplication | null;
	activeTab: "overview" | "contacts" | "interviews" = "overview";

	constructor(
		app: App,
		plugin: JobApplicationTrackerPlugin,
		application: JobApplication | null = null,
		defaultTab: "overview" | "contacts" | "interviews" = "overview"
	) {
		super(app);
		this.plugin = plugin;
		this.application = application;
		this.activeTab = defaultTab;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("job-tracker-modal");

		if (!this.application) {
			new SelectApplicationModal(this.app, this.plugin, (selectedApp) => {
				new ManageApplicationModal(this.app, this.plugin, selectedApp, this.activeTab).open();
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

		// Re-fetch fresh application data from file
		const file = this.plugin.appService.resolveFile(this.application.filePath);
		if (file instanceof TFile) {
			const freshApp = this.plugin.appService.getApplicationFromCache(file);
			if (freshApp) {
				this.application = freshApp;
			}
		}

		const header = contentEl.createDiv({ cls: "job-tracker-modal-header" });
		header.createEl("h2", { text: `Manage: ${this.application.company}` });
		header.createEl("p", {
			text: `${this.application.role} • Status: ${this.application.status}`,
			cls: "job-tracker-modal-subtitle",
		});

		// Tab navigation buttons
		const tabRow = contentEl.createDiv({ cls: "job-tracker-view-switcher job-tracker-modal-switcher" });

		const overviewTabBtn = tabRow.createEl("button", {
			cls: `job-tracker-mode-btn ${this.activeTab === "overview" ? "is-active" : ""}`,
			text: "Overview & Note",
		});
		overviewTabBtn.onclick = () => {
			this.activeTab = "overview";
			this.renderModal();
		};

		const contactsTabBtn = tabRow.createEl("button", {
			cls: `job-tracker-mode-btn ${this.activeTab === "contacts" ? "is-active" : ""}`,
			text: `Contacts (${this.application.contacts.length})`,
		});
		contactsTabBtn.onclick = () => {
			this.activeTab = "contacts";
			this.renderModal();
		};

		const interviewsTabBtn = tabRow.createEl("button", {
			cls: `job-tracker-mode-btn ${this.activeTab === "interviews" ? "is-active" : ""}`,
			text: `Interviews (${this.application.interviews.length})`,
		});
		interviewsTabBtn.onclick = () => {
			this.activeTab = "interviews";
			this.renderModal();
		};

		const tabContainer = contentEl.createDiv({ cls: "job-tracker-modal-tab-content" });

		if (this.activeTab === "overview") {
			this.renderOverviewTab(tabContainer);
		} else if (this.activeTab === "contacts") {
			this.renderContactsTab(tabContainer);
		} else {
			this.renderInterviewsTab(tabContainer);
		}
	}

	renderOverviewTab(container: HTMLElement) {
		if (!this.application) return;

		container.createEl("p", {
			text: "Quick actions and details for this application.",
			cls: "text-muted",
		});

		new Setting(container)
			.setName("Open Application Note")
			.setDesc("Open the full Markdown note in your workspace")
			.addButton((btn) =>
				btn.setButtonText("Open Note").onClick(async () => {
					this.close();
					const file = this.plugin.appService.resolveFile(this.application!.filePath);
					if (file instanceof TFile) {
						const leaf = this.app.workspace.getLeaf(false);
						await leaf.openFile(file);
					}
				})
			);

		if (this.application.jobDescriptionFile) {
			new Setting(container)
				.setName("Attached Job Description")
				.setDesc(this.application.jobDescriptionFile)
				.addButton((btn) =>
					btn.setButtonText("Open Attachment").onClick(async () => {
						const file = this.plugin.appService.resolveFile(this.application!.jobDescriptionFile!);
						if (file instanceof TFile) {
							const leaf = this.app.workspace.getLeaf(false);
							await leaf.openFile(file);
						} else {
							new Notice("Attachment file could not be found.");
						}
					})
				);
		}

		new Setting(container)
			.setName("Delete Application")
			.setDesc("Move this application note to the Obsidian trash")
			.addButton((btn) =>
				btn
					.setButtonText("Delete Application")
					.setDestructive()
					.onClick(() => {
						new ConfirmDeleteModal(
							this.app,
							`Delete ${this.application?.company}?`,
							`Are you sure you want to delete the application note for "${this.application?.company} - ${this.application?.role}"? This will move the file to trash.`,
							"Delete Application",
							async () => {
								try {
									const file = this.plugin.appService.resolveFile(this.application!.filePath);
									if (file instanceof TFile) {
										await this.plugin.appService.deleteApplication(file);
										this.close();
									} else {
										new Notice("Application file could not be found. It may have been moved or deleted.");
									}
								} catch (err) {
									console.error("Job Tracker: Modal action failed:", err);
									new Notice(`Operation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
								}
							}
						).open();
					})
			);
	}

	renderContactsTab(container: HTMLElement) {
		if (!this.application) return;

		new Setting(container)
			.setName("Key Contacts")
			.setDesc("Manage recruiters, interviewers, and team members connected to this role.")
			.addButton((btn) =>
				btn
					.setButtonText("+ Add Contact")
					.setCta()
					.onClick(() => {
						new AddContactModal(this.app, this.plugin, this.application).open();
						this.close();
					})
			);

		const contacts = this.application.contacts || [];

		if (contacts.length === 0) {
			container.createEl("p", {
				text: "No contacts added yet. Click '+ Add Contact' above to record recruiter or hiring manager details.",
				cls: "text-muted",
			});
			return;
		}

		const listDiv = container.createDiv({ cls: "job-tracker-modal-item-list" });

		for (const contact of contacts) {
			const itemCard = listDiv.createDiv({ cls: "job-tracker-list-item" });

			const infoDiv = itemCard.createDiv({ cls: "job-tracker-list-main" });
			const nameRow = infoDiv.createDiv({ cls: "job-tracker-list-title-row" });
			nameRow.createEl("strong", { text: contact.name });
			nameRow.createSpan({ text: `(${contact.role})`, cls: "text-muted" });

			const detailsRow = infoDiv.createDiv({ cls: "job-tracker-list-details" });
			if (contact.email) detailsRow.createSpan({ text: `✉️ ${contact.email}` });
			if (contact.phone) detailsRow.createSpan({ text: `📞 ${contact.phone}` });
			if (contact.linkedin) detailsRow.createSpan({ text: `🔗 LinkedIn` });
			if (contact.notes) detailsRow.createSpan({ text: `📝 ${contact.notes}`, cls: "activity-note" });

			const actionsDiv = itemCard.createDiv({ cls: "job-tracker-list-actions" });

			const deleteBtn = actionsDiv.createEl("button", {
				cls: "job-tracker-icon-btn",
				attr: { "aria-label": "Delete contact" },
			});
			setIcon(deleteBtn, "trash-2");
			deleteBtn.onclick = () => {
				new ConfirmDeleteModal(
					this.app,
					`Delete Contact: ${contact.name}?`,
					`Are you sure you want to remove "${contact.name}" from this application?`,
					"Remove Contact",
					async () => {
						try {
							const file = this.plugin.appService.resolveFile(this.application!.filePath);
							if (file instanceof TFile) {
								await this.plugin.appService.deleteContact(file, contact.id);
								this.renderModal();
							} else {
								new Notice("Application file could not be found. It may have been moved or deleted.");
							}
						} catch (err) {
							console.error("Job Tracker: Modal action failed:", err);
							new Notice(`Operation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
						}
					}
				).open();
			};
		}
	}

	renderInterviewsTab(container: HTMLElement) {
		if (!this.application) return;

		new Setting(container)
			.setName("Interview Stages & Debriefs")
			.setDesc("Track rounds, schedule new interviews, or log debrief feedback.")
			.addButton((btn) =>
				btn
					.setButtonText("+ Schedule Interview")
					.setCta()
					.onClick(() => {
						new AddInterviewModal(this.app, this.plugin, this.application).open();
						this.close();
					})
			);

		const interviews = this.application.interviews || [];

		if (interviews.length === 0) {
			container.createEl("p", {
				text: "No interviews recorded yet. Click '+ Schedule Interview' above to add a round.",
				cls: "text-muted",
			});
			return;
		}

		const listDiv = container.createDiv({ cls: "job-tracker-modal-item-list" });

		for (const iv of interviews) {
			const itemCard = listDiv.createDiv({ cls: "job-tracker-list-item" });

			const infoDiv = itemCard.createDiv({ cls: "job-tracker-list-main" });
			const titleRow = infoDiv.createDiv({ cls: "job-tracker-list-title-row" });
			titleRow.createEl("strong", { text: iv.roundName });
			titleRow.createSpan({
				text: iv.status,
				cls: `job-tracker-status-badge ${iv.status === "Completed" ? "status-offer" : iv.status === "Cancelled" ? "status-rejected" : "status-interviewing"}`,
			});

			const detailsRow = infoDiv.createDiv({ cls: "job-tracker-list-details" });
			if (iv.date) detailsRow.createSpan({ text: `📅 ${iv.date} ${iv.time || ""}` });
			if (iv.interviewers) detailsRow.createSpan({ text: `👥 ${iv.interviewers}` });
			if (iv.outcomeNotes) detailsRow.createSpan({ text: `💬 ${iv.outcomeNotes}`, cls: "activity-note" });

			const actionsDiv = itemCard.createDiv({ cls: "job-tracker-list-actions" });

			if (iv.prepNotePath) {
				const prepBtn = actionsDiv.createEl("button", {
					cls: "job-tracker-action-pill-btn",
					text: "Prep Note",
				});
				prepBtn.onclick = async () => {
					this.close();
					const prepFile = this.plugin.appService.resolveFile(iv.prepNotePath!);
					if (prepFile instanceof TFile) {
						const leaf = this.app.workspace.getLeaf(false);
						await leaf.openFile(prepFile);
					}
				};
			}

			const debriefBtn = actionsDiv.createEl("button", {
				cls: "job-tracker-action-pill-btn",
				text: "Log Outcome",
			});
			debriefBtn.onclick = () => {
				const modal = new LogInterviewOutcomeModal(this.app, this.plugin, this.application);
				modal.selectedInterviewId = iv.id;
				modal.open();
				this.close();
			};

			const deleteBtn = actionsDiv.createEl("button", {
				cls: "job-tracker-icon-btn",
				attr: { "aria-label": "Delete interview round" },
			});
			setIcon(deleteBtn, "trash-2");
			deleteBtn.onclick = () => {
				new ConfirmDeleteModal(
					this.app,
					`Delete Interview: ${iv.roundName}?`,
					`Are you sure you want to remove "${iv.roundName}" from this application?`,
					"Remove Round",
					async () => {
						try {
							const file = this.plugin.appService.resolveFile(this.application!.filePath);
							if (file instanceof TFile) {
								await this.plugin.appService.deleteInterview(file, iv.id);
								this.renderModal();
							} else {
								new Notice("Application file could not be found. It may have been moved or deleted.");
							}
						} catch (err) {
							console.error("Job Tracker: Modal action failed:", err);
							new Notice(`Operation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
						}
					}
				).open();
			};
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
