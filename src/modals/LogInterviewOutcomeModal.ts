import { App, Modal, Notice, Setting, TFile } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { InterviewRound, JobApplication, JobStatus } from "../types";
import { SelectApplicationModal } from "./UpdateStatusModal";

/**
 * Modal dialog to log interview round debrief notes, record completion outcome, and advance pipeline stage.
 */
export class LogInterviewOutcomeModal extends Modal {
	plugin: JobApplicationTrackerPlugin;
	application: JobApplication | null;

	selectedInterviewId = "";
	status: "Completed" | "Cancelled" = "Completed";
	outcomeNotes = "";
	nextStage: JobStatus | "" = "";

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
				new LogInterviewOutcomeModal(this.app, this.plugin, selectedApp).open();
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

		contentEl.createEl("h2", { text: `Log Interview Outcome: ${this.application.company}` });
		contentEl.createEl("p", {
			text: `${this.application.role}`,
			cls: "job-tracker-modal-subtitle",
		});

		const interviews = this.application.interviews || [];
		if (interviews.length === 0) {
			contentEl.createEl("p", {
				text: "No interviews found for this application. Please add an interview first.",
			});
			new Setting(contentEl).addButton((btn) =>
				btn.setButtonText("Close").onClick(() => this.close())
			);
			return;
		}

		if (!this.selectedInterviewId) {
			this.selectedInterviewId = interviews[0].id;
		}

		// Interview selector
		new Setting(contentEl)
			.setName("Select Interview")
			.setDesc("Which interview round are you debriefing?")
			.addDropdown((dropdown) => {
				for (const iv of interviews) {
					const label = `${iv.roundName} (${iv.status}${iv.date ? ` - ${iv.date}` : ""})`;
					dropdown.addOption(iv.id, label);
				}
				dropdown.setValue(this.selectedInterviewId);
				dropdown.onChange((value) => {
					this.selectedInterviewId = value;
				});
			});

		// Status
		new Setting(contentEl)
			.setName("Interview Outcome")
			.setDesc("Mark interview as completed or cancelled")
			.addDropdown((dropdown) => {
				dropdown.addOption("Completed", "Completed");
				dropdown.addOption("Cancelled", "Cancelled");
				dropdown.setValue(this.status);
				dropdown.onChange((value) => {
					this.status = value as "Completed" | "Cancelled";
				});
			});

		// Notes
		new Setting(contentEl)
			.setName("Debrief & Notes")
			.setDesc("Key questions asked, feedback received, vibe check, or self-assessment")
			.addTextArea((text) => {
				text.setPlaceholder("Debrief notes...").onChange((value) => {
					this.outcomeNotes = value;
				});
				text.inputEl.rows = 4;
			});

		// Next Stage
		new Setting(contentEl)
			.setName("Update Overall Application Status")
			.setDesc("Optionally transition the application to a new stage")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Keep Current Status (" + this.application?.status + ")");
				for (const st of this.plugin.settings.statuses) {
					dropdown.addOption(st, st);
				}
				dropdown.setValue(this.nextStage);
				dropdown.onChange((value) => {
					this.nextStage = value as JobStatus | "";
				});
			});

		// Action buttons
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Save Outcome")
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
		if (!this.application || !this.selectedInterviewId) return;

		try {
			const file = this.plugin.appService.resolveFile(this.application.filePath);
			if (file instanceof TFile) {
				await this.plugin.appService.updateInterviewOutcome(
					file,
					this.selectedInterviewId,
					this.status,
					this.outcomeNotes.trim() || undefined,
					this.nextStage ? (this.nextStage as JobStatus) : undefined
				);
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
