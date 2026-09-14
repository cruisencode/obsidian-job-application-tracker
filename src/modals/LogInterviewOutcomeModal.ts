import { App, ButtonComponent, Setting } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { JobApplication, JobStatus } from "../types";
import { BaseApplicationModal } from "./BaseApplicationModal";

/**
 * Modal dialog to log interview round debrief notes, record completion outcome, and advance pipeline stage.
 */
export class LogInterviewOutcomeModal extends BaseApplicationModal {
	private onComplete?: () => void;
	selectedInterviewId = "";
	private status: "Completed" | "Cancelled" = "Completed";
	private outcomeNotes = "";
	private nextStage: JobStatus | "" = "";

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

		// Interview Round Selector
		new Setting(contentEl)
			.setName("Interview Round")
			.setDesc("Select the round to record an outcome for")
			.addDropdown((dropdown) => {
				for (const iv of interviews) {
					dropdown.addOption(iv.id, `${iv.roundName} (${iv.status})`);
				}
				dropdown.setValue(this.selectedInterviewId);
				dropdown.onChange((val) => {
					this.selectedInterviewId = val;
					const selected = interviews.find((i) => i.id === val);
					if (selected && selected.outcomeNotes) {
						this.outcomeNotes = selected.outcomeNotes;
					}
					this.renderContent();
				});
			});

		// Status (Completed / Cancelled)
		new Setting(contentEl)
			.setName("Round Outcome")
			.setDesc("Mark this round as completed or cancelled")
			.addDropdown((dropdown) => {
				dropdown.addOption("Completed", "Completed / Held");
				dropdown.addOption("Cancelled", "Cancelled");
				dropdown.setValue(this.status);
				dropdown.onChange((val) => {
					this.status = val as "Completed" | "Cancelled";
				});
			});

		// Outcome / Debrief Notes
		new Setting(contentEl)
			.setName("Debrief Notes & Feedback")
			.setDesc("What questions were asked? What went well? Areas for follow-up?")
			.addTextArea((text) => {
				text.inputEl.maxLength = 2000;
				text
					.setPlaceholder("Debrief notes, topics discussed, impressions...")
					.setValue(this.outcomeNotes)
					.onChange((value) => {
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
		let submitBtn: ButtonComponent;
		new Setting(contentEl)
			.addButton((btn) => {
				submitBtn = btn;
				btn
					.setButtonText("Save Outcome")
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
		if (!this.application || !this.selectedInterviewId) return;

		try {
			const file = this.resolveApplicationFile();
			if (!file) {
				btn?.setDisabled(false);
				return;
			}

			await this.plugin.appService.updateInterviewOutcome(
				file,
				this.selectedInterviewId,
				this.status,
				this.outcomeNotes.trim() || undefined,
				this.nextStage || undefined
			);
			this.close();
			if (this.onComplete) {
				this.onComplete();
			}
		} catch (err) {
			btn?.setDisabled(false);
			this.handleModalError("Save interview outcome", err);
		}
	}
}
