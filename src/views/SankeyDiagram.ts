/**
 * Native SVG Sankey Diagram Renderer for Obsidian Job Application Tracker.
 * Renders pure SVG DOM elements without external dependencies or security prompts.
 */

export interface SankeyLink {
	source: string;
	target: string;
	value: number;
}

export interface SankeyNode {
	id: string;
	label: string;
	layer: number;
	value: number;
	x: number;
	y: number;
	width: number;
	height: number;
	color: string;
}

export function getNodeColor(id: string): string {
	const lower = id.toLowerCase();
	if (lower.includes("rejected")) return "var(--color-red, #ef4444)";
	if (lower.includes("ghosted")) return "var(--color-orange, #ea580c)";
	if (lower.includes("withdrawn")) return "var(--color-base-60, #94a3b8)";
	if (lower.includes("accepted")) return "var(--color-green, #10b981)";
	if (lower.includes("offer")) return "var(--color-yellow, #f59e0b)";
	if (lower.includes("interviewing")) return "var(--color-blue, #3b82f6)";
	if (lower.includes("screening")) return "var(--color-cyan, #06b6d4)";
	if (lower.includes("applied")) return "var(--color-purple, #8b5cf6)";
	if (lower.includes("wishlist")) return "var(--color-slate, #94a3b8)";

	// Source colors based on hash/palette
	const sourcePalette = [
		"#3b82f6",
		"#8b5cf6",
		"#ec4899",
		"#06b6d4",
		"#10b981",
		"#f59e0b",
		"#6366f1",
		"#14b8a6",
	];
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash << 5) - hash + id.charCodeAt(i);
	}
	return sourcePalette[Math.abs(hash) % sourcePalette.length];
}

/**
 * Canonical rank for stages: positive progression at the top (lower values),
 * and terminal drop-offs/outcomes at the bottom (higher values).
 */
export function getStageRank(id: string): number {
	const lower = id.toLowerCase().trim();
	// Drop-offs / terminal outcomes at the bottom
	if (lower.includes("ghosted")) return 110;
	if (lower.includes("withdrawn")) return 120;
	if (lower.includes("rejected")) return 130;

	// Positive progression at the top
	if (lower.includes("wishlist")) return 10;
	if (lower.includes("applied")) return 20;
	if (lower.includes("screening")) return 30;
	if (lower.includes("interviewing")) return 40;
	if (lower.includes("offer")) return 50;
	if (lower.includes("accepted")) return 60;
	return 80; // default / custom statuses
}

/**
 * Formats and safely truncates display text labels for diagram nodes.
 */
export function formatDisplayLabel(rawLabel: string, value: number, maxChars = 22): string {
	let clean = (rawLabel || "").trim();
	if (clean.includes(": ")) {
		const parts = clean.split(": ");
		clean = parts[parts.length - 1].trim();
	}
	const displayStr = clean.length > maxChars ? clean.slice(0, maxChars - 1) + "…" : clean;
	return `${displayStr} (${value})`;
}

/**
 * Renders a complete interactive Sankey SVG into the provided container.
 */
export function renderSankeyDiagram(container: HTMLElement, links: SankeyLink[], totalApps: number): void {
		const prevController = (container as unknown as { _sankeyAbort?: AbortController })._sankeyAbort;
		if (prevController) {
			prevController.abort();
		}
		const abortController = new AbortController();
		(container as unknown as { _sankeyAbort?: AbortController })._sankeyAbort = abortController;
		const { signal } = abortController;

		container.empty();

		if (links.length === 0 || totalApps === 0) {
			container.createEl("p", {
				text: "No application flow data available yet.",
				cls: "text-muted",
			});
			return;
		}

		// 1. Collect all unique nodes
		const nodeMap = new Map<string, SankeyNode>();
		const outgoingMap = new Map<string, SankeyLink[]>();
		const incomingMap = new Map<string, SankeyLink[]>();

		for (const link of links) {
			if (!outgoingMap.has(link.source)) outgoingMap.set(link.source, []);
			outgoingMap.get(link.source)!.push(link);

			if (!incomingMap.has(link.target)) incomingMap.set(link.target, []);
			incomingMap.get(link.target)!.push(link);
		}

		const allNodeIds = new Set<string>();
		for (const link of links) {
			allNodeIds.add(link.source);
			allNodeIds.add(link.target);
		}

		// 2. Assign layer/column using topological depth
		const layers = new Map<string, number>();

		// Find root nodes (no incoming links)
		const roots: string[] = [];
		for (const id of allNodeIds) {
			if (!incomingMap.has(id) || incomingMap.get(id)!.length === 0) {
				roots.push(id);
			}
		}

		// Fallback if all have incoming (should not happen in DAG)
		if (roots.length === 0 && allNodeIds.size > 0) {
			roots.push(Array.from(allNodeIds)[0]);
		}

		// BFS to assign layers
		const queue: { id: string; layer: number }[] = roots.map((r) => ({ id: r, layer: 0 }));
		for (const r of roots) layers.set(r, 0);

		let iterations = 0;
		const maxIterations = Math.max(100, allNodeIds.size * 3);

		while (queue.length > 0 && iterations++ < maxIterations) {
			const { id, layer } = queue.shift()!;
			// Skip stale queue items if node was already advanced to a higher layer
			if ((layers.get(id) || 0) > layer) continue;

			const outs = outgoingMap.get(id) || [];
			for (const link of outs) {
				const prevLayer = layers.get(link.target) ?? -1;
				const nextLayer = Math.max(prevLayer, layer + 1);
				if (nextLayer > prevLayer) {
					layers.set(link.target, nextLayer);
					queue.push({ id: link.target, layer: nextLayer });
				}
			}
		}

		// Ensure all node IDs are assigned a layer (default to 0 if unreachable from roots)
		for (const id of allNodeIds) {
			if (!layers.has(id)) {
				layers.set(id, 0);
			}
		}

		const maxLayer = Array.from(layers.values()).reduce((max, v) => Math.max(max, v), 1);

		// Group and sort nodes by layer to separate progression paths from drop-offs
		const layerGroups = new Map<number, string[]>();
		for (const [id, layer] of layers.entries()) {
			if (!layerGroups.has(layer)) layerGroups.set(layer, []);
			layerGroups.get(layer)!.push(id);
		}

		for (let layer = 0; layer <= maxLayer; layer++) {
			const nodeIds = layerGroups.get(layer) || [];
			if (layer === 0) {
				// Sources: sort primarily by min target stage rank (e.g. Wishlist=10 before Applied=20)
				// secondary by volume descending
				nodeIds.sort((a, b) => {
					const outsA = outgoingMap.get(a) || [];
					const outsB = outgoingMap.get(b) || [];
					const minRankA = outsA.reduce((min, l) => Math.min(min, SankeyDiagram.getStageRank(l.target)), 999);
					const minRankB = outsB.reduce((min, l) => Math.min(min, SankeyDiagram.getStageRank(l.target)), 999);
					if (minRankA !== minRankB) return minRankA - minRankB;
					const valA = outsA.reduce((acc, l) => acc + l.value, 0);
					const valB = outsB.reduce((acc, l) => acc + l.value, 0);
					if (valB !== valA) return valB - valA;
					return a.localeCompare(b);
				});
			} else {
				// Stages: sort by stage rank (positive progression on top, terminal drop-offs on bottom)
				nodeIds.sort((a, b) => {
					const rankA = SankeyDiagram.getStageRank(a);
					const rankB = SankeyDiagram.getStageRank(b);
					if (rankA !== rankB) return rankA - rankB;
					const valA = (outgoingMap.get(a) || []).reduce((acc, l) => acc + l.value, 0);
					const valB = (outgoingMap.get(b) || []).reduce((acc, l) => acc + l.value, 0);
					if (valB !== valA) return valB - valA;
					return a.localeCompare(b);
				});
			}
		}

		// Calculate node values: max(incomingSum, outgoingSum)
		for (const id of allNodeIds) {
			const inSum = (incomingMap.get(id) || []).reduce((acc, l) => acc + l.value, 0);
			const outSum = (outgoingMap.get(id) || []).reduce((acc, l) => acc + l.value, 0);
			const val = Math.max(inSum, outSum, 1);
			nodeMap.set(id, {
				id,
				label: id,
				layer: layers.get(id) || 0,
				value: val,
				x: 0,
				y: 0,
				width: 14,
				height: 0,
				color: getNodeColor(id),
			});
		}

		// 3. Geometry & Layout Coordinates
		// Dynamically compute left and right padding based on actual label lengths to ensure labels never clip
		const leftNodeIds = layerGroups.get(0) || [];
		const rightNodeIds = layerGroups.get(maxLayer) || [];

		const maxLeftChars = leftNodeIds.reduce((max, id) => {
			const n = nodeMap.get(id);
			return Math.max(max, formatDisplayLabel(n?.label || id, n?.value || 0).length);
		}, 10);

		const maxRightChars = rightNodeIds.reduce((max, id) => {
			const n = nodeMap.get(id);
			return Math.max(max, formatDisplayLabel(n?.label || id, n?.value || 0).length);
		}, 10);

		const paddingLeft = Math.max(120, Math.min(220, Math.ceil(maxLeftChars * 7.5) + 24));
		const paddingRight = Math.max(120, Math.min(220, Math.ceil(maxRightChars * 7.5) + 24));
		const paddingY = 40;
		const nodeGap = 16;

		const baseWidth = Math.max(880, maxLayer * 200 + paddingLeft + paddingRight);
		let baseHeight = Math.max(420, baseWidth * 0.5);

		const usableWidth = baseWidth - paddingLeft - paddingRight;
		let usableHeight = baseHeight - paddingY * 2;
		const layerXStep = maxLayer > 0 ? usableWidth / maxLayer : usableWidth;

		// Compute node heights and adjust baseHeight if columns are tall
		let maxColHeight = 0;
		for (let layer = 0; layer <= maxLayer; layer++) {
			const nodeIds = layerGroups.get(layer) || [];
			if (nodeIds.length === 0) continue;

			const totalValue = nodeIds.reduce((sum, id) => sum + (nodeMap.get(id)?.value || 0), 0);
			const availableHeight = usableHeight - (nodeIds.length - 1) * nodeGap;
			const pixelsPerUnit = totalValue > 0 ? Math.min(32, Math.max(8, availableHeight / totalValue)) : 20;

			let colHeight = 0;
			for (const id of nodeIds) {
				const n = nodeMap.get(id)!;
				const outCount = outgoingMap.get(id)?.length || 0;
				const inCount = incomingMap.get(id)?.length || 0;
				const minPortHeight = Math.max(outCount, inCount) * 4;
				n.height = Math.max(18, n.value * pixelsPerUnit, minPortHeight);
				colHeight += n.height;
			}
			colHeight += (nodeIds.length - 1) * nodeGap;
			if (colHeight > maxColHeight) maxColHeight = colHeight;
		}

		if (maxColHeight > usableHeight) {
			baseHeight = maxColHeight + paddingY * 2;
			usableHeight = baseHeight - paddingY * 2;
		}

		// 1. Initial layout: Position all nodes sequentially in each column
		// Active progression nodes start at paddingY, drop-off nodes follow strictly below
		for (let layer = 0; layer <= maxLayer; layer++) {
			const nodeIds = layerGroups.get(layer) || [];
			if (nodeIds.length === 0) continue;

			const currentX = paddingLeft + layer * layerXStep;
			let currentY = paddingY;

			const activeNodes = nodeIds.filter((id) => SankeyDiagram.getStageRank(id) < 100);
			const dropOffNodes = nodeIds.filter((id) => SankeyDiagram.getStageRank(id) >= 100);

			for (const id of activeNodes) {
				const n = nodeMap.get(id)!;
				n.x = currentX;
				n.y = currentY;
				currentY += n.height + nodeGap;
			}

			if (dropOffNodes.length > 0) {
				if (activeNodes.length > 0) {
					currentY = Math.max(currentY + nodeGap, paddingY + usableHeight * 0.45);
				} else {
					currentY = Math.max(paddingY + usableHeight * 0.45, paddingY);
				}

				for (const id of dropOffNodes) {
					const n = nodeMap.get(id)!;
					n.x = currentX;
					n.y = currentY;
					currentY += n.height + nodeGap;
				}
			}
		}

		// 2. Determine active obstacle boundaries per column
		const colActiveBottom = new Map<number, number>();
		for (let layer = 0; layer <= maxLayer; layer++) {
			let maxB = paddingY;
			for (const id of (layerGroups.get(layer) || [])) {
				if (SankeyDiagram.getStageRank(id) < 100) {
					const n = nodeMap.get(id)!;
					maxB = Math.max(maxB, n.y + n.height);
				}
			}
			colActiveBottom.set(layer, maxB);
		}

		// 3. Pre-compute link port offsets sorted by target/source vertical positions
		const sourceLinkOffsets = new Map<SankeyLink, number>();
		const targetLinkOffsets = new Map<SankeyLink, number>();
		const sourceLinkHeights = new Map<SankeyLink, number>();
		const targetLinkHeights = new Map<SankeyLink, number>();

		// Outgoing links:
		// 1. Sort by target layer ascending (links to earlier stages like Wishlist exit higher)
		// 2. Secondary sort by target node y position ascending
		for (const [nodeId, outLinks] of outgoingMap.entries()) {
			const srcNode = nodeMap.get(nodeId);
			if (!srcNode) continue;
			outLinks.sort((a, b) => {
				const tgtA = nodeMap.get(a.target);
				const tgtB = nodeMap.get(b.target);
				const layerA = tgtA ? tgtA.layer : 0;
				const layerB = tgtB ? tgtB.layer : 0;
				if (layerA !== layerB) {
					return layerA - layerB; // Earlier stage exits higher
				}
				const yA = tgtA ? tgtA.y : 0;
				const yB = tgtB ? tgtB.y : 0;
				if (yA !== yB) {
					return yA - yB;
				}
				return a.target.localeCompare(b.target);
			});

			const totalOutVal = outLinks.reduce((sum, l) => sum + l.value, 0);
			let sOffset = 0;
			for (const link of outLinks) {
				const rawH = totalOutVal > 0 ? (link.value / totalOutVal) * srcNode.height : srcNode.height;
				const h = Math.max(4, rawH);
				sourceLinkHeights.set(link, h);
				sourceLinkOffsets.set(link, sOffset);
				sOffset += h;
			}
		}

		// Incoming links:
		// 1. Sort by source layer descending (links from closer stages like Wishlist enter higher)
		// 2. Secondary sort by source node y position ascending
		for (const [nodeId, inLinks] of incomingMap.entries()) {
			const tgtNode = nodeMap.get(nodeId);
			if (!tgtNode) continue;
			inLinks.sort((a, b) => {
				const srcA = nodeMap.get(a.source);
				const srcB = nodeMap.get(b.source);
				const layerA = srcA ? srcA.layer : 0;
				const layerB = srcB ? srcB.layer : 0;
				if (layerA !== layerB) {
					return layerB - layerA; // Closer stage enters higher
				}
				const yA = srcA ? srcA.y : 0;
				const yB = srcB ? srcB.y : 0;
				if (yA !== yB) {
					return yA - yB;
				}
				return a.source.localeCompare(b.source);
			});

			const totalInVal = inLinks.reduce((sum, l) => sum + l.value, 0);
			let tOffset = 0;
			for (const link of inLinks) {
				const rawH = totalInVal > 0 ? (link.value / totalInVal) * tgtNode.height : tgtNode.height;
				const h = Math.max(4, rawH);
				targetLinkHeights.set(link, h);
				targetLinkOffsets.set(link, tOffset);
				tOffset += h;
			}
		}

		// 4. Expand canvas height dynamically if needed to ensure zero clipping
		let maxTotalHeight = baseHeight;
		for (const n of nodeMap.values()) {
			maxTotalHeight = Math.max(maxTotalHeight, n.y + n.height + paddingY);
		}

		// Account for multi-layer link ribbons that curve below intermediate obstacles
		for (const link of links) {
			const sourceNode = nodeMap.get(link.source);
			const targetNode = nodeMap.get(link.target);
			if (!sourceNode || !targetNode || targetNode.layer <= sourceNode.layer + 1) continue;

			let minClearY = 0;
			for (let m = sourceNode.layer + 1; m < targetNode.layer; m++) {
				const colBottom = colActiveBottom.get(m) || 0;
				if (colBottom > minClearY) minClearY = colBottom + nodeGap;
			}

			if (minClearY > 0) {
				const sOffset = sourceLinkOffsets.get(link) || 0;
				const tOffset = targetLinkOffsets.get(link) || 0;
				const sH = sourceLinkHeights.get(link) || 4;
				const tH = targetLinkHeights.get(link) || 4;
				const y0 = sourceNode.y + sOffset;
				const y1 = targetNode.y + tOffset;
				if (Math.min(y0, y1) < minClearY) {
					const ctrlYBot = Math.max(
						y0 + sH,
						y1 + tH,
						(minClearY + Math.max(sH, tH) - 0.125 * (y0 + sH + y1 + tH)) / 0.75
					);
					maxTotalHeight = Math.max(maxTotalHeight, ctrlYBot + paddingY);
				}
			}
		}
		baseHeight = maxTotalHeight;

		// 5. Build SVG with Obsidian's createSvg helper
		const svg = container.createSvg("svg", {
			cls: "job-tracker-native-sankey-svg",
			attr: {
				viewBox: `0 0 ${baseWidth} ${baseHeight}`,
				preserveAspectRatio: "xMidYMid meet",
				role: "img",
				"aria-label": "Sankey diagram showing job application pipeline flow",
			},
		});

		// Definitions for gradients & filters
		const defs = svg.createSvg("defs");

		// Draw Links (Ribbons)
		const linksGroup = svg.createSvg("g", { cls: "job-tracker-sankey-links" });

		// Sort links so longer multi-layer jumps render beneath immediate transitions
		const sortedLinks = [...links].sort((a, b) => {
			const srcA = nodeMap.get(a.source);
			const tgtA = nodeMap.get(a.target);
			const srcB = nodeMap.get(b.source);
			const tgtB = nodeMap.get(b.target);
			const spanA = tgtA && srcA ? tgtA.layer - srcA.layer : 1;
			const spanB = tgtB && srcB ? tgtB.layer - srcB.layer : 1;
			if (spanB !== spanA) return spanB - spanA; // Longer span in the back
			return b.value - a.value; // Larger value in the back
		});

		const allRibbonEls: { el: SVGPathElement; link: SankeyLink }[] = [];
		const allNodeEls: { el: SVGGElement; id: string }[] = [];

		for (const link of sortedLinks) {
			const sourceNode = nodeMap.get(link.source);
			const targetNode = nodeMap.get(link.target);
			if (!sourceNode || !targetNode) continue;

			const sOffset = sourceLinkOffsets.get(link) || 0;
			const tOffset = targetLinkOffsets.get(link) || 0;
			const sourceLinkHeight = sourceLinkHeights.get(link) || 4;
			const targetLinkHeight = targetLinkHeights.get(link) || 4;

			const x0 = sourceNode.x + sourceNode.width;
			const y0 = sourceNode.y + sOffset;
			const x1 = targetNode.x;
			const y1 = targetNode.y + tOffset;

			let pathData: string;

			if (targetNode.layer <= sourceNode.layer + 1) {
				// Direct adjacent transition: smooth standard cubic Bezier
				const curvature = 0.5;
				const xi = x0 + (x1 - x0) * curvature;
				pathData = `
					M ${x0} ${y0}
					C ${xi} ${y0}, ${xi} ${y1}, ${x1} ${y1}
					L ${x1} ${y1 + targetLinkHeight}
					C ${xi} ${y1 + targetLinkHeight}, ${xi} ${y0 + sourceLinkHeight}, ${x0} ${y0 + sourceLinkHeight}
					Z
				`;
			} else {
				// Multi-layer jump: check if intermediate active obstacles need clearance
				let minClearY = 0;
				for (let m = sourceNode.layer + 1; m < targetNode.layer; m++) {
					const colBottom = colActiveBottom.get(m) || 0;
					if (colBottom > minClearY) {
						minClearY = colBottom + nodeGap;
					}
				}

				if (minClearY > 0 && Math.min(y0, y1) < minClearY) {
					// Closed-form target control Y ensuring Bezier at t=0.5 clears minClearY
					const ctrlYTop = Math.max(y0, y1, (minClearY - 0.125 * (y0 + y1)) / 0.75);
					const ctrlYBot = Math.max(
						y0 + sourceLinkHeight,
						y1 + targetLinkHeight,
						(minClearY + Math.max(sourceLinkHeight, targetLinkHeight) - 0.125 * (y0 + sourceLinkHeight + y1 + targetLinkHeight)) / 0.75
					);

					const cx1 = x0 + (x1 - x0) * 0.35;
					const cx2 = x1 - (x1 - x0) * 0.35;

					pathData = `
						M ${x0} ${y0}
						C ${cx1} ${ctrlYTop}, ${cx2} ${ctrlYTop}, ${x1} ${y1}
						L ${x1} ${y1 + targetLinkHeight}
						C ${cx2} ${ctrlYBot}, ${cx1} ${ctrlYBot}, ${x0} ${y0 + sourceLinkHeight}
						Z
					`;
				} else {
					const curvature = 0.5;
					const xi = x0 + (x1 - x0) * curvature;
					pathData = `
						M ${x0} ${y0}
						C ${xi} ${y0}, ${xi} ${y1}, ${x1} ${y1}
						L ${x1} ${y1 + targetLinkHeight}
						C ${xi} ${y1 + targetLinkHeight}, ${xi} ${y0 + sourceLinkHeight}, ${x0} ${y0 + sourceLinkHeight}
						Z
					`;
				}
			}

			// Create linear gradient for link
			const gradId = `sankey-grad-${crypto.randomUUID()}`;
			const grad = defs.createSvg("linearGradient", {
				attr: {
					id: gradId,
					gradientUnits: "userSpaceOnUse",
					x1: `${x0}`,
					y1: `${y0}`,
					x2: `${x1}`,
					y2: `${y1}`,
				},
			});

			grad.createSvg("stop", {
				attr: {
					offset: "0%",
					"stop-color": sourceNode.color,
					"stop-opacity": "0.55",
				},
			});

			grad.createSvg("stop", {
				attr: {
					offset: "100%",
					"stop-color": targetNode.color,
					"stop-opacity": "0.55",
				},
			});

			const path = linksGroup.createSvg("path", {
				cls: "job-tracker-sankey-ribbon",
				attr: {
					d: pathData,
					fill: `url(#${gradId})`,
					"data-source": link.source,
					"data-target": link.target,
				},
			});

			const cleanSource = link.source.includes(": ") ? link.source.split(": ").pop()! : link.source;
			const cleanTarget = link.target.includes(": ") ? link.target.split(": ").pop()! : link.target;
			const linkTitle = path.createSvg("title");
			linkTitle.textContent = `${cleanSource} → ${cleanTarget}: ${link.value} application${link.value === 1 ? "" : "s"}`;

			allRibbonEls.push({ el: path, link });
		}

		// Draw Nodes
		const nodesGroup = svg.createSvg("g", { cls: "job-tracker-sankey-nodes" });

		for (const node of nodeMap.values()) {
			const g = nodesGroup.createSvg("g", {
				cls: "job-tracker-sankey-node",
				attr: {
					"data-node-id": node.id,
				},
			});

			allNodeEls.push({ el: g, id: node.id });

			// Rect
			g.createSvg("rect", {
				attr: {
					x: `${node.x}`,
					y: `${node.y}`,
					width: `${node.width}`,
					height: `${node.height}`,
					rx: "3",
					ry: "3",
					fill: node.color,
					stroke: "var(--background-primary, #ffffff)",
					"stroke-width": "1",
				},
			});

			// Text Label
			const isRightSide = node.layer === maxLayer;
			let labelX = `${node.x + node.width / 2}`;
			let labelY = `${Math.max(14, node.y - 6)}`;
			let textAnchor = "middle";

			if (isRightSide) {
				labelX = `${node.x + node.width + 8}`;
				labelY = `${node.y + node.height / 2 + 4}`;
				textAnchor = "start";
			} else if (node.layer === 0) {
				labelX = `${node.x - 8}`;
				labelY = `${node.y + node.height / 2 + 4}`;
				textAnchor = "end";
			}

			const labelText = g.createSvg("text", {
				attr: {
					"font-size": "11px",
					"font-family": "var(--font-default, sans-serif)",
					fill: "var(--text-normal, #dcddde)",
					"font-weight": "500",
					x: labelX,
					y: labelY,
					"text-anchor": textAnchor,
				},
			});
			labelText.textContent = formatDisplayLabel(node.label, node.value);

			const cleanNodeLabel = node.label.includes(": ") ? node.label.split(": ").pop()! : node.label;
			const nodeTitle = g.createSvg("title");
			nodeTitle.textContent = `${cleanNodeLabel}: ${node.value} application${node.value === 1 ? "" : "s"}`;
		}

		// 5. Interactive Focus Mode: highlight hovered flows and dim unrelated paths
		let isFocused = false;

		const resetFocus = () => {
			if (!isFocused) return;
			isFocused = false;
			for (const r of allRibbonEls) {
				r.el.classList.remove("is-dimmed", "is-highlighted");
			}
			for (const n of allNodeEls) {
				n.el.classList.remove("is-dimmed", "is-highlighted");
			}
		};

		const focusRibbon = (targetEntry: { el: SVGPathElement; link: SankeyLink }) => {
			isFocused = true;
			for (const r of allRibbonEls) {
				if (r === targetEntry) {
					r.el.classList.remove("is-dimmed");
					r.el.classList.add("is-highlighted");
				} else {
					r.el.classList.remove("is-highlighted");
					r.el.classList.add("is-dimmed");
				}
			}

			const activeSource = targetEntry.link.source;
			const activeTarget = targetEntry.link.target;
			for (const n of allNodeEls) {
				if (n.id === activeSource || n.id === activeTarget) {
					n.el.classList.remove("is-dimmed");
					n.el.classList.add("is-highlighted");
				} else {
					n.el.classList.remove("is-highlighted");
					n.el.classList.add("is-dimmed");
				}
			}
		};

		const focusNode = (nodeId: string) => {
			isFocused = true;
			const connectedNodes = new Set<string>([nodeId]);

			for (const r of allRibbonEls) {
				if (r.link.source === nodeId || r.link.target === nodeId) {
					r.el.classList.remove("is-dimmed");
					r.el.classList.add("is-highlighted");
					connectedNodes.add(r.link.source);
					connectedNodes.add(r.link.target);
				} else {
					r.el.classList.remove("is-highlighted");
					r.el.classList.add("is-dimmed");
				}
			}

			for (const n of allNodeEls) {
				if (connectedNodes.has(n.id)) {
					n.el.classList.remove("is-dimmed");
					n.el.classList.add("is-highlighted");
				} else {
					n.el.classList.remove("is-highlighted");
					n.el.classList.add("is-dimmed");
				}
			}
		};

		// Attach focus event listeners without DOM mutations
		for (const r of allRibbonEls) {
			r.el.addEventListener(
				"pointerenter",
				(e) => {
					e.stopPropagation();
					focusRibbon(r);
				},
				{ signal }
			);
		}

		for (const n of allNodeEls) {
			n.el.addEventListener(
				"pointerenter",
				(e) => {
					e.stopPropagation();
					focusNode(n.id);
				},
				{ signal }
			);
		}

		// Fallbacks: automatically reset focus whenever pointer leaves interactive elements or SVG
		svg.addEventListener(
			"pointermove",
			(e) => {
				const target = e.target as Element | null;
				const isOverRibbon = target?.closest(".job-tracker-sankey-ribbon");
				const isOverNode = target?.closest(".job-tracker-sankey-node");
				if (!isOverRibbon && !isOverNode) {
					resetFocus();
				}
			},
			{ signal }
		);

		svg.addEventListener("pointerleave", resetFocus, { signal });
		container.addEventListener("mouseleave", resetFocus, { signal });
}

export const SankeyDiagram = {
	getNodeColor,
	getStageRank,
	formatDisplayLabel,
	render: renderSankeyDiagram,
};
