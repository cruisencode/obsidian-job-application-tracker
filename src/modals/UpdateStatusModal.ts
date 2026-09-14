import { App, ButtonComponent, FuzzySuggestModal, Setting } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { JobApplication, JobStatus } from "../types";
import { BaseApplicationModal } from "./BaseApplicationModal";

/**
 * Fuzzy search modal allowing the user to select an active job application.
 */
export class SelectApplicationModal extends FuzzySuggestModal<JobApplication> {
	plugin: JobApplicationTrackerPlugin;
	applications: JobApplication[];
	onSelect: (app: JobApplication) => void;

	constructor(
		app: App,
		plugin: JobApplicationTrackerPlugin,
		onSelect: (app: JobApplication) => void,
		applications?: JobApplication[]
	) {
		super(app);
		this.plugin = plugin;
		this.onSelect = onSelect;
		this.applications = applications || this.plugin.appService.getAllApplications();
		this.setPlaceholder("Type to search application by company or role...");
		this.emptyStateText = "No applications found.";
	}

	getItems(): JobApplication[] {
		return this.applications || [];
	}

	getItemText(item: JobApplication): string {
		return `${item.company} - ${item.role} [${item.status}]`;
	}

	onChooseItem(item: JobApplication, evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(item);
	}
}

/**
 * Quick status update modal for transitioning an application stage and logging notes to activity log.
 */
export class UpdateStatusModal extends BaseApplicationModal {
	private newStatus: JobStatus;
	private note = "";

	constructor(app: App, plugin: JobApplicationTrackerPlugin, application: JobApplication | null = null) {
		super(app, plugin, application);
		this.newStatus = application?.status || plugin.settings.defaultStatus || "Applied";
	}

	renderContent(): void {
		const { contentEl } = this;
		contentEl.empty();

		if (!this.application) return;

		contentEl.createEl("h2", { text: `Update Status: ${this.application.company}` });
		contentEl.createEl("p", {
			text: `${this.application.role} (Current: ${this.application.status})`,
			cls: "job-tracker-modal-subtitle",
		});

		new Setting(contentEl)
			.setName("New Status")
			.setDesc("Select the updated stage")
			.addDropdown((dropdown) => {
				for (const st of this.plugin.settings.statuses) {
					dropdown.addOption(st, st);
				}
				dropdown.setValue(this.newStatus);
				dropdown.onChange((value) => {
					this.newStatus = value as JobStatus;
				});
			});

		new Setting(contentEl)
			.setName("Status Note (Optional)")
			.setDesc("Reason, recruiter feedback, rejection note, or stage details")
			.addTextArea((text) => {
				text.inputEl.maxLength = 2000;
				text.setPlaceholder("e.g. Completed recruiter phone screen. Advancing to round 1.").setValue(this.note).onChange(
					(value) => {
						this.note = value;
					}
				);
				text.inputEl.rows = 3;
			});

		let submitBtn: ButtonComponent;
		new Setting(contentEl)
			.addButton((btn) => {
				submitBtn = btn;
				btn
					.setButtonText("Update Status")
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
			const file = this.resolveApplicationFile();
			if (!file) {
				btn?.setDisabled(false);
				return;
			}

			await this.plugin.appService.updateStatus(file, this.newStatus, this.note.trim());
			this.close();
		} catch (err) {
			btn?.setDisabled(false);
			this.handleModalError("Update status", err);
		}
	}
}
