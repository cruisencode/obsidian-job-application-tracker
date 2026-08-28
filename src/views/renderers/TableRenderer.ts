import { setIcon } from "obsidian";
import { JobApplication } from "../../types";
import { UpdateStatusModal } from "../../modals/UpdateStatusModal";
import { JobTrackerView } from "../JobTrackerView";

export class TableRenderer {
	private view: JobTrackerView;

	constructor(view: JobTrackerView) {
		this.view = view;
	}

	render(container: HTMLElement, apps: JobApplication[]) {
		const tableWrapper = container.createDiv({ cls: "job-tracker-table-wrapper" });
		const table = tableWrapper.createEl("table", { cls: "job-tracker-table" });

		// Table Header
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");

		const columns: { label: string; field: keyof JobApplication }[] = [
			{ label: "Company", field: "company" },
			{ label: "Role", field: "role" },
			{ label: "Status", field: "status" },
			{ label: "Applied Date", field: "dateApplied" },
			{ label: "Location", field: "location" },
			{ label: "Salary", field: "salary" },
			{ label: "Source", field: "source" },
		];

		for (const col of columns) {
			const isSorted = this.view.sortField === col.field;
			const ariaSort = isSorted ? (this.view.sortAscending ? "ascending" : "descending") : "none";
			const th = headerRow.createEl("th", {
				cls: "job-tracker-sortable-th",
				attr: { role: "columnheader", "aria-sort": ariaSort, tabindex: "0" },
			});
			th.createSpan({ text: col.label });
			if (isSorted) {
				const sortIcon = th.createSpan({ cls: "job-tracker-sort-indicator" });
				setIcon(sortIcon, this.view.sortAscending ? "arrow-up" : "arrow-down");
			}
			const handleSort = () => {
				if (this.view.sortField === col.field) {
					this.view.sortAscending = !this.view.sortAscending;
				} else {
					this.view.sortField = col.field;
					this.view.sortAscending = true;
				}
				this.view.renderContentOnly();
			};
			th.onclick = handleSort;
			th.onkeydown = (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleSort();
				}
			};
		}

		headerRow.createEl("th", { text: "Contacts" });
		headerRow.createEl("th", { text: "Interviews" });
		headerRow.createEl("th", { text: "Actions" });

		// Table Body
		const tbody = table.createEl("tbody");
		for (const app of apps) {
			const tr = tbody.createEl("tr");

			// Company
			const tdCompany = tr.createEl("td", { cls: "job-tracker-td-company" });
			const cLink = tdCompany.createEl("a", {
				text: app.company,
				cls: "job-tracker-company-link",
				attr: { role: "link", tabindex: "0" },
			});
			cLink.onclick = () => this.view.openNote(app.filePath);
			cLink.onkeydown = (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					this.view.openNote(app.filePath);
				}
			};

			// Role
			tr.createEl("td", { text: app.role });

			// Status Badge
			const tdStatus = tr.createEl("td");
			const statusBadge = tdStatus.createSpan({
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

			// Applied Date
			tr.createEl("td", { text: app.dateApplied || "-" });

			// Location
			tr.createEl("td", { text: app.location || "-" });

			// Salary
			tr.createEl("td", { text: app.salary || "-" });

			// Source
			tr.createEl("td", { text: app.source || "-" });

			// Contacts
			const tdContacts = tr.createEl("td");
			if (app.contacts && app.contacts.length > 0) {
				tdContacts.createSpan({
					text: `${app.contacts.map((c) => c.name).join(", ")}`,
					cls: "job-tracker-table-contacts-preview",
				});
			} else {
				tdContacts.createSpan({ text: "-", cls: "text-muted" });
			}

			// Interviews
			const tdInterviews = tr.createEl("td");
			if (app.interviews && app.interviews.length > 0) {
				tdInterviews.createSpan({
					text: `${app.interviews.length} round(s)`,
					cls: "job-tracker-table-interviews-badge",
				});
			} else {
				tdInterviews.createSpan({ text: "-", cls: "text-muted" });
			}

			// Actions
			const tdActions = tr.createEl("td", { cls: "job-tracker-td-actions" });
			const actionMenuBtn = tdActions.createEl("button", {
				cls: "job-tracker-action-btn",
				attr: { "aria-label": "Actions" },
			});
			setIcon(actionMenuBtn, "more-horizontal");
			actionMenuBtn.onclick = (e) => {
				this.view.showCardMenu(e, app);
			};
		}
	}
}
