import { setIcon } from "obsidian";
import { SankeyDiagram, SankeyLink } from "../SankeyDiagram";
import { JobTrackerView } from "../JobTrackerView";

/**
 * Renderer for the Analytics & Metrics dashboard, including KPI cards, Sankey flow diagram,
 * stage breakdown progress bars, source conversion tables, and recent activity timeline.
 */
export class MetricsRenderer {
	private view: JobTrackerView;

	constructor(view: JobTrackerView) {
		this.view = view;
	}

	/**
	 * Renders the full statistics and analytics dashboard.
	 */
	render(container: HTMLElement) {
		const metricsContainer = container.createDiv({ cls: "job-tracker-metrics-container" });
		const m = this.view.getOrComputeMetrics();

		// 1. KPI Cards Grid
		const kpiGrid = metricsContainer.createDiv({ cls: "job-tracker-kpi-grid" });

		this.renderKpiCard(kpiGrid, "Total Applications", `${m.totalApps}`, "briefcase", `${m.appliedTotal} submitted, ${m.wishlistCount} wishlist`);
		this.renderKpiCard(kpiGrid, "Active Pipeline", `${m.activeCount}`, "activity", "In progress & active offers");
		this.renderKpiCard(kpiGrid, "Response Rate", `${m.responseRate}%`, "mail", `${m.respondedCount} of ${m.appliedTotal} submitted`);
		this.renderKpiCard(kpiGrid, "Interview Rate", `${m.interviewRate}%`, "calendar-check", `${m.interviewCount} of ${m.appliedTotal} submitted`);
		this.renderKpiCard(
			kpiGrid,
			"Offers / Accepted",
			`${m.offerCount}`,
			"award",
			`${m.acceptedCount} offer(s) accepted`
		);
		this.renderKpiCard(kpiGrid, "Total Contacts", `${m.totalContacts}`, "users", "Recruiters & hiring managers");
		this.renderKpiCard(
			kpiGrid,
			"Interviews",
			`${m.totalInterviews}`,
			"clock",
			`${m.completedInterviews} completed rounds`
		);

		// 2. Section: Sankey Pipeline Flow Diagram
		const sankeySection = metricsContainer.createDiv({ cls: "job-tracker-metrics-section" });
		sankeySection.createEl("h4", { text: "Job Search Sankey Diagram" });
		const sankeyDesc = sankeySection.createEl("p", {
			text: "Visual flow of your job hunt based on actual statuses entered/exited, from source to final outcomes.",
			cls: "text-muted",
		});
		sankeyDesc.style.marginTop = "0";
		sankeyDesc.style.marginBottom = "14px";
		sankeyDesc.style.fontSize = "0.82em";

		const sankeyContent = sankeySection.createDiv({ cls: "job-tracker-sankey-container" });
		this.renderSankeyDiagram(sankeyContent);

		// 3. Section: Pipeline Stage Breakdown
		const funnelSection = metricsContainer.createDiv({ cls: "job-tracker-metrics-section" });
		funnelSection.createEl("h4", { text: "Pipeline Stage Breakdown" });

		const funnelBars = funnelSection.createDiv({ cls: "job-tracker-funnel-bars" });

		for (const st of this.view.plugin.settings.statuses) {
			const count = this.view.applications.filter((a) => a.status === st).length;
			const pct = m.totalApps > 0 ? ((count / m.totalApps) * 100).toFixed(1) : "0";

			const barItem = funnelBars.createDiv({ cls: "job-tracker-funnel-item" });

			const labelRow = barItem.createDiv({ cls: "job-tracker-funnel-label-row" });
			const leftLabel = labelRow.createDiv({ cls: "job-tracker-funnel-left" });
			leftLabel.createSpan({ text: st, cls: `job-tracker-status-badge status-${st.toLowerCase()}` });

			const rightLabel = labelRow.createDiv({ cls: "job-tracker-funnel-right" });
			rightLabel.createSpan({
				text: `${count} (${pct}%)`,
				cls: "text-muted",
			});

			const progressBg = barItem.createDiv({ cls: "job-tracker-progress-bg" });
			const progressFill = progressBg.createDiv({
				cls: `job-tracker-progress-fill status-${st.toLowerCase()}`,
			});
			progressFill.style.width = `${pct}%`;
		}

		// 4. Section: Source Performance Analytics
		const sourceSection = metricsContainer.createDiv({ cls: "job-tracker-metrics-section" });
		sourceSection.createEl("h4", { text: "Source Performance & Conversion" });

		if (m.sourceMap.size === 0) {
			sourceSection.createEl("p", {
				text: "No source data available yet.",
				cls: "text-muted",
			});
		} else {
			const sourceTable = sourceSection.createEl("table", { cls: "job-tracker-table job-tracker-source-table" });
			const stHead = sourceTable.createEl("thead");
			const stHeadRow = stHead.createEl("tr");
			stHeadRow.createEl("th", { text: "Source" });
			stHeadRow.createEl("th", { text: "Applications" });
			stHeadRow.createEl("th", { text: "Interviews Landed" });
			stHeadRow.createEl("th", { text: "Offers Landed" });
			stHeadRow.createEl("th", { text: "Interview %" });

			const stBody = sourceTable.createEl("tbody");
			for (const [sourceName, stats] of m.sourceMap.entries()) {
				const tr = stBody.createEl("tr");
				tr.createEl("td", { text: sourceName, cls: "font-semibold" });
				tr.createEl("td", { text: `${stats.total}` });
				tr.createEl("td", { text: `${stats.interviews}` });
				tr.createEl("td", { text: `${stats.offers}` });
				const srcIvRate = stats.total > 0 ? ((stats.interviews / stats.total) * 100).toFixed(0) : "0";
				tr.createEl("td", { text: `${srcIvRate}%` });
			}
		}

		// 5. Section: Recent Activity Timeline
		const activitySection = metricsContainer.createDiv({ cls: "job-tracker-metrics-section" });
		activitySection.createEl("h4", { text: "Recent Application Activity" });

		if (m.allHistoryEntries.length === 0) {
			activitySection.createEl("p", {
				text: "No recent status activity recorded yet.",
				cls: "text-muted",
			});
		} else {
			const activityList = activitySection.createDiv({ cls: "job-tracker-activity-list" });
			for (const entry of m.allHistoryEntries.slice(0, 10)) {
				const item = activityList.createDiv({ cls: "job-tracker-activity-item" });
				item.createSpan({ cls: `job-tracker-activity-dot status-${entry.status.toLowerCase()}` });

				const textContainer = item.createDiv({ cls: "job-tracker-activity-text" });
				const titleRow = textContainer.createDiv({ cls: "job-tracker-activity-title-row" });
				const compLink = titleRow.createEl("a", {
					text: entry.company,
					cls: "job-tracker-activity-comp-link",
					attr: { role: "link", tabindex: "0" },
				});
				compLink.onclick = () => this.view.openNote(entry.filePath);
				compLink.onkeydown = (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						this.view.openNote(entry.filePath);
					}
				};

				titleRow.createSpan({ text: `(${entry.role})` });
				titleRow.createSpan({
					text: entry.status,
					cls: `job-tracker-status-badge status-${entry.status.toLowerCase()}`,
				});
				titleRow.createSpan({ text: entry.date, cls: "job-tracker-activity-date" });

				if (entry.note) {
					textContainer.createDiv({ text: entry.note, cls: "job-tracker-activity-note" });
				}
			}
		}
	}

	renderKpiCard(container: HTMLElement, label: string, value: string, icon: string, subtext: string) {
		const card = container.createDiv({ cls: "job-tracker-kpi-card" });
		const top = card.createDiv({ cls: "job-tracker-kpi-top" });
		top.createSpan({ text: label, cls: "job-tracker-kpi-label" });
		const iconEl = top.createSpan({ cls: "job-tracker-kpi-icon" });
		setIcon(iconEl, icon);

		card.createDiv({ text: value, cls: "job-tracker-kpi-value" });
		card.createDiv({ text: subtext, cls: "job-tracker-kpi-subtext" });
	}

	renderSankeyDiagram(container: HTMLElement) {
		container.empty();

		if (this.view.applications.length === 0) {
			container.createEl("p", {
				text: "No application data available yet. Add applications to see your Sankey flow diagram.",
				cls: "text-muted",
			});
			return;
		}

		// Count transitions between nodes ensuring strict DAG property (no cycles)
		const transitionMap = new Map<string, number>();

		// Helper to detect if adding fromNode -> toNode creates a cycle (i.e. toNode can already reach fromNode)
		const wouldCreateCycle = (fromNode: string, toNode: string): boolean => {
			const visited = new Set<string>();
			const queue = [toNode];
			while (queue.length > 0) {
				const current = queue.shift()!;
				if (current === fromNode) return true;
				visited.add(current);
				for (const key of transitionMap.keys()) {
					const [u, v] = key.split("|||");
					if (u === current && !visited.has(v)) {
						queue.push(v);
					}
				}
			}
			return false;
		};

		const addTransition = (fromNode: string, toNode: string, count = 1) => {
			if (fromNode === toNode || count <= 0) return;
			const cleanFrom = fromNode.replace(/[,;"\n\r]+/g, " ").trim();
			const cleanTo = toNode.replace(/[,;"\n\r]+/g, " ").trim();
			if (!cleanFrom || !cleanTo || cleanFrom === cleanTo) return;

			const key = `${cleanFrom}|||${cleanTo}`;
			if (transitionMap.has(key)) {
				transitionMap.set(key, transitionMap.get(key)! + count);
				return;
			}

			// If this new link would create a global cycle, reject it to avoid circular link crashes
			if (wouldCreateCycle(cleanFrom, cleanTo)) {
				return;
			}

			transitionMap.set(key, count);
		};

		// Track each application along the exact sequence of statuses it entered and exited
		for (const app of this.view.applications) {
			const source = app.source ? app.source : "Direct / Other";
			const visited = this.view.getVisitedStatuses(app);

			if (visited.length === 0) continue;

			// Connect Source to the first stage entered
			const firstStage = visited[0];
			addTransition(source, firstStage, 1);

			// Connect all sequential stage transitions
			for (let i = 0; i < visited.length - 1; i++) {
				const fromStage = visited[i];
				const toStage = visited[i + 1];
				addTransition(fromStage, toStage, 1);
			}
		}

		if (transitionMap.size === 0) {
			container.createEl("p", {
				text: "Not enough flow transitions to render diagram.",
				cls: "text-muted",
			});
			return;
		}

		const sankeyLinks: SankeyLink[] = [];
		for (const [key, count] of transitionMap.entries()) {
			const [from, to] = key.split("|||");
			sankeyLinks.push({
				source: from,
				target: to,
				value: count,
			});
		}

		SankeyDiagram.render(container, sankeyLinks, this.view.applications.length);
	}
}
