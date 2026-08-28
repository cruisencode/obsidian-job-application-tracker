import { setIcon } from "obsidian";
import { JobApplication } from "../../types";
import { UpdateStatusModal } from "../../modals/UpdateStatusModal";
import { AddInterviewModal } from "../../modals/AddInterviewModal";
import { AddContactModal } from "../../modals/AddContactModal";
import { JobTrackerView } from "../JobTrackerView";

/**
 * Renderer for the compact List view mode, emphasizing upcoming interviews and quick action buttons.
 */
export class ListRenderer {
	private view: JobTrackerView;

	constructor(view: JobTrackerView) {
		this.view = view;
	}

	/**
	 * Renders the compact card list for applications.
	 */
	render(container: HTMLElement, apps: JobApplication[]) {
		const listContainer = container.createDiv({ cls: "job-tracker-list-container" });

		for (const app of apps) {
			const item = listContainer.createDiv({
				cls: "job-tracker-list-item",
				attr: { role: "article", "aria-label": `${app.company} - ${app.role}` },
			});

			const mainInfo = item.createDiv({ cls: "job-tracker-list-main" });
			const titleRow = mainInfo.createDiv({ cls: "job-tracker-list-title-row" });
			const compLink = titleRow.createEl("a", {
				text: app.company,
				cls: "job-tracker-list-company",
				attr: { role: "link", tabindex: "0" },
			});
			compLink.onclick = () => { void this.view.openNote(app.filePath); };
			compLink.onkeydown = (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					void this.view.openNote(app.filePath);
				}
			};

			titleRow.createSpan({ text: "•", cls: "job-tracker-divider" });
			titleRow.createSpan({ text: app.role, cls: "job-tracker-list-role" });

			const statusBadge = titleRow.createSpan({
				text: app.status,
				cls: `job-tracker-status-badge status-${app.status.toLowerCase()}`,
				attr: { role: "button", tabindex: "0", "aria-label": `Change status: ${app.status}` },
			});
			statusBadge.onclick = () => {
				new UpdateStatusModal(this.view.app, this.view.plugin, app).open();
			};
			statusBadge.onkeydown = (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					new UpdateStatusModal(this.view.app, this.view.plugin, app).open();
				}
			};

			// Details row
			const detailsRow = mainInfo.createDiv({ cls: "job-tracker-list-details" });
			if (app.location) detailsRow.createSpan({ text: `📍 ${app.location}` });
			if (app.workplaceType) detailsRow.createSpan({ text: `🏢 ${app.workplaceType}` });
			if (app.salary) detailsRow.createSpan({ text: `💰 ${app.salary}` });
			if (app.source) detailsRow.createSpan({ text: `🔗 ${app.source}` });
			if (app.dateApplied) detailsRow.createSpan({ text: `📅 Applied: ${app.dateApplied}` });
			if (app.followUpDate) detailsRow.createSpan({ text: `🔔 Follow-up: ${app.followUpDate}`, cls: "job-tracker-list-highlight" });
			if (app.jobDescriptionFile) {
				const isPdf = app.jobDescriptionFile.toLowerCase().endsWith(".pdf");
				const jdPill = detailsRow.createSpan({
					text: isPdf ? `📄 PDF JD` : `📝 MD JD`,
					cls: "job-tracker-list-highlight job-tracker-clickable",
					attr: { "aria-label": `Open attached JD: ${app.jobDescriptionFile}`, role: "button", tabindex: "0" },
				});
				jdPill.onclick = () => { void this.view.openNote(app.jobDescriptionFile!); };
				jdPill.onkeydown = (e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						void this.view.openNote(app.jobDescriptionFile!);
					}
				};
			}

			if (app.interviews && app.interviews.length > 0) {
				const nextIv = app.interviews.find((i) => i.status === "Scheduled");
				if (nextIv) {
					detailsRow.createSpan({
						text: `⏳ Next: ${nextIv.roundName} (${nextIv.date || "TBD"})`,
						cls: "job-tracker-list-highlight",
					});
				}
			}

			// Actions
			const actions = item.createDiv({ cls: "job-tracker-list-actions" });

			const addIvBtn = actions.createEl("button", {
				cls: "job-tracker-action-pill-btn",
				text: "+ Interview",
			});
			addIvBtn.onclick = () => new AddInterviewModal(this.view.app, this.view.plugin, app).open();

			const addContactBtn = actions.createEl("button", {
				cls: "job-tracker-action-pill-btn",
				text: "+ Contact",
			});
			addContactBtn.onclick = () => new AddContactModal(this.view.app, this.view.plugin, app).open();

			const menuBtn = actions.createEl("button", {
				cls: "job-tracker-icon-btn",
				attr: { "aria-label": "More options" },
			});
			setIcon(menuBtn, "more-vertical");
			menuBtn.onclick = (e) => this.view.showCardMenu(e, app);
		}
	}
}
