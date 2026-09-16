import { App, Modal, Notice, Setting, TFile } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { JobApplication } from "../types";

/**
 * Abstract base modal providing common scaffolding, application selection fallback,
 * error handling, and file resolution for Job Application Tracker modals.
 */
export abstract class BaseApplicationModal extends Modal {
	protected plugin: JobApplicationTrackerPlugin;
	application: JobApplication | null;
	protected isCompleted = false;
	protected onComplete?: () => void;
	protected onCancel?: () => void;

	constructor(
		app: App,
		plugin: JobApplicationTrackerPlugin,
		application: JobApplication | null = null,
		onComplete?: () => void,
		onCancel?: () => void
	) {
		super(app);
		this.plugin = plugin;
		this.application = application;
		this.onComplete = onComplete;
		this.onCancel = onCancel;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("job-tracker-modal");

		if (!this.application) {
			const applications = this.plugin.appService.getAllApplications();
			if (applications.length === 0) {
				this.renderNoApplicationsMessage(contentEl);
				return;
			}
			this.renderApplicationSelector(contentEl, applications);
			return;
		}

		await this.renderContent();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		if (!this.isCompleted && this.onCancel) {
			this.onCancel();
		}
	}

	/**
	 * Renders the primary modal content once an application is selected.
	 */
	abstract renderContent(): Promise<void> | void;

	/**
	 * Displays a standard message when no applications exist in the vault.
	 */
	protected renderNoApplicationsMessage(container: HTMLElement): void {
		container.createEl("h2", { text: "No Job Applications" });
		container.createEl("p", {
			text: "No job applications found in your vault. Please create an application first.",
		});
	}

	/**
	 * Renders an inline application picker when none was pre-selected.
	 */
	protected renderApplicationSelector(container: HTMLElement, applications: JobApplication[]): void {
		container.createEl("h2", { text: "Select Application" });
		new Setting(container)
			.setName("Application")
			.setDesc("Choose the job application to proceed with")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "-- Select an Application --");
				for (const app of applications) {
					dropdown.addOption(app.filePath, `${app.company} - ${app.role}`);
				}
				dropdown.onChange((val) => {
					const selected = applications.find((a) => a.filePath === val);
					if (selected) {
						this.application = selected;
						void this.onOpen();
					}
				});
			});
	}

	/**
	 * Resolves the TFile for the currently targeted application.
	 * Displays a user Notice and returns null if the file cannot be located.
	 */
	protected resolveApplicationFile(): TFile | null {
		if (!this.application) {
			new Notice("No application selected.");
			return null;
		}
		const file = this.plugin.appService.resolveFile(this.application.filePath);
		if (file instanceof TFile) {
			return file;
		}
		new Notice("Application file could not be found. It may have been moved or deleted.");
		return null;
	}

	/**
	 * Unified error handler that logs to console and displays a Notice to the user.
	 */
	protected handleModalError(actionName: string, err: unknown): void {
		console.error(`Job Tracker: ${actionName} failed:`, err);
		new Notice(`${actionName} failed: ${err instanceof Error ? err.message : "Unknown error"}`);
	}
}
