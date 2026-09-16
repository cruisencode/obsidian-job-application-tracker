import { setIcon } from "obsidian";
import { JobApplication } from "../../types";
import { getStatusClassName } from "../../constants";
import { UpdateStatusModal } from "../../modals/UpdateStatusModal";
import { AddInterviewModal } from "../../modals/AddInterviewModal";
import { AddContactModal } from "../../modals/AddContactModal";
import { JobTrackerView } from "../JobTrackerView";

/**
 * Renderer for the compact List view mode, emphasizing upcoming interviews and quick action buttons.
 */
export class ListRenderer {
	private view: JobTrackerView;
	private displayedLimit = 50;

	constructor(view: JobTrackerView) {
		this.view = view;
	}

	resetPagination() {
		this.displayedLimit = 50;
	}

	/**
	 * Renders the compact card list for applications.
	 */
	render(container: HTMLElement, apps: JobApplication[]) {
		const listContainer = container.createDiv({ cls: "job-tracker-list-container" });
		const displayedApps = apps.slice(0, this.displayedLimit);

		for (const app of displayedApps) {
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
				cls: `job-tracker-status-badge ${getStatusClassName(app.status)}`,
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
			if (app.location) {
				const itemSpan = detailsRow.createSpan({ cls: "job-tracker-detail-item" });
				setIcon(itemSpan.createSpan({ cls: "job-tracker-detail-icon" }), "map-pin");
				itemSpan.createSpan({ text: ` ${app.location}` });
			}
			if (app.workplaceType) {
				const itemSpan = detailsRow.createSpan({ cls: "job-tracker-detail-item" });
				setIcon(itemSpan.createSpan({ cls: "job-tracker-detail-icon" }), "building");
				itemSpan.createSpan({ text: ` ${app.workplaceType}` });
			}
			if (app.salary) {
				const itemSpan = detailsRow.createSpan({ cls: "job-tracker-detail-item" });
				setIcon(itemSpan.createSpan({ cls: "job-tracker-detail-icon" }), "dollar-sign");
				itemSpan.createSpan({ text: ` ${app.salary}` });
			}
			if (app.source) {
				const itemSpan = detailsRow.createSpan({ cls: "job-tracker-detail-item" });
				setIcon(itemSpan.createSpan({ cls: "job-tracker-detail-icon" }), "link");
				itemSpan.createSpan({ text: ` ${app.source}` });
			}
			if (app.dateApplied) {
				const itemSpan = detailsRow.createSpan({ cls: "job-tracker-detail-item" });
				setIcon(itemSpan.createSpan({ cls: "job-tracker-detail-icon" }), "calendar");
				itemSpan.createSpan({ text: ` Applied: ${app.dateApplied}` });
			}
			if (app.followUpDate) {
				const itemSpan = detailsRow.createSpan({ cls: "job-tracker-detail-item job-tracker-list-highlight" });
				setIcon(itemSpan.createSpan({ cls: "job-tracker-detail-icon" }), "bell");
				itemSpan.createSpan({ text: ` Follow-up: ${app.followUpDate}` });
			}
			if (app.jobDescriptionFile) {
				const isPdf = app.jobDescriptionFile.toLowerCase().endsWith(".pdf");
				const jdPill = detailsRow.createSpan({
					cls: "job-tracker-list-highlight job-tracker-clickable job-tracker-detail-item",
					attr: { "aria-label": `Open attached JD: ${app.jobDescriptionFile}`, role: "button", tabindex: "0" },
				});
				setIcon(jdPill.createSpan({ cls: "job-tracker-detail-icon" }), isPdf ? "file" : "file-text");
				jdPill.createSpan({ text: isPdf ? " PDF JD" : " MD JD" });
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
					const nextSpan = detailsRow.createSpan({
						cls: "job-tracker-list-highlight job-tracker-detail-item",
					});
					setIcon(nextSpan.createSpan({ cls: "job-tracker-detail-icon" }), "clock");
					nextSpan.createSpan({ text: ` Next: ${nextIv.roundName} (${nextIv.date || "TBD"})` });
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

		if (apps.length > this.displayedLimit) {
			const paginationDiv = container.createDiv({ cls: "job-tracker-pagination-bar" });
			paginationDiv.createSpan({
				text: `Showing ${displayedApps.length} of ${apps.length} applications`,
				cls: "job-tracker-pagination-info text-muted",
			});
			const remaining = apps.length - this.displayedLimit;
			const loadMoreBtn = paginationDiv.createEl("button", {
				text: `Load More (${Math.min(50, remaining)} more)`,
				cls: "job-tracker-load-more-btn mod-cta",
			});
			loadMoreBtn.onclick = () => {
				this.displayedLimit += 50;
				this.view.renderContentOnly();
			};
		}
	}
}
