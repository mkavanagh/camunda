/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {DataTable, type DataTableColumn} from '@camunda/design-system';
import {cn} from '#/shared/cn';
import {ExpandableListSkeletonRow} from '../ExpandableListSkeletonRow';
import type {ExpandableListRow, ExpandableListVariantProps} from '../ExpandableList.types';

// A synthetic row appended/prepended to the real ones while a page is being
// fetched, rendered as an extra table row so its skeleton bar sits inside
// the DataTable's own tbody, matching the same visual style (and column
// layout) as the DS's own initial-load skeleton rows (`SkeletonRows` in
// `data-table.js`) instead of a disconnected element below/above the table.
type DisplayRow = {kind: 'row'; row: ExpandableListRow} | {kind: 'skeleton'; id: string; testId: string; label: string};

const ComposedCell: React.FC<ExpandableListVariantProps> = ({
	header,
	rows,
	renderExpansion,
	isPending,
	isFetchingNextPage,
	isFetchingPreviousPage,
	loadingNextPage,
	loadingPreviousPage,
}) => {
	const displayRows: DisplayRow[] = [
		...(isFetchingPreviousPage
			? [
					{
						kind: 'skeleton' as const,
						id: '__skeleton-previous',
						testId: loadingPreviousPage.testId,
						label: loadingPreviousPage.label,
					},
				]
			: []),
		...rows.map((row): DisplayRow => ({kind: 'row', row})),
		...(isFetchingNextPage
			? [
					{
						kind: 'skeleton' as const,
						id: '__skeleton-next',
						testId: loadingNextPage.testId,
						label: loadingNextPage.label,
					},
				]
			: []),
	];

	const columns: DataTableColumn<DisplayRow>[] = [
		{
			id: 'content',
			header,
			cell: ({row: displayRow}) => {
				const data = displayRow.original;

				if (data.kind === 'skeleton') {
					return (
						<div data-expandable={false}>
							<ExpandableListSkeletonRow testId={data.testId} label={data.label} />
						</div>
					);
				}

				return <div data-expandable={renderExpansion(data.row) !== null}>{data.row.content}</div>;
			},
		},
	];

	return (
		<div
			className={cn(
				'contents',
				// The DS DataTable's `<table>` uses the browser's default auto
				// table-layout, so with the auto-injected expand-toggle column plus
				// this single content column, the content column sizes to the
				// widest row's label instead of the container — defeating
				// InstancesBar's own overflow/ellipsis truncation. `table-fixed`
				// plus a fixed width on the toggle column instead gives the content
				// column a stable, predictable remainder to truncate against.
				'[&_[data-slot=table]]:table-fixed',
				'[&_[data-slot=table-row]>[data-slot=table-head]:first-child]:w-10',
				'[&_tr:has([data-expandable=false])_[data-slot=data-table-expand-toggle]]:hidden!',
				// DataTable's own scroll container hard-codes `overflow-y-hidden`
				// (it isn't meant to own vertical scrolling itself — see its own
				// comment) — but that also makes it the nearest ancestor scroll
				// container for CSS purposes, which would stop a `sticky` header
				// from tracking the *real* scrollable ancestor (this list's own
				// `overflow-y-auto` div in `ExpandableList`). Clearing it back to
				// `visible` lets the sticky header resolve against that real
				// scroller instead. Safe here since `table-fixed` above already
				// bounds the table to the container's width, so there's nothing
				// left to horizontally scroll.
				'[&_[data-slot=table-container]]:overflow-visible!',
				// The rounded card border/background this container normally
				// draws itself now lives on `ExpandableList`'s own outer,
				// never-scrolling container instead (see its comment) — this
				// container scrolls along with the rows, so its own copy would
				// otherwise render as a giant border spanning the full row
				// count, with only its top/bottom edges (and their rounded
				// corners) passing through the viewport as the user scrolls.
				'[&_[data-slot=table-container]]:rounded-none! [&_[data-slot=table-container]]:border-0! [&_[data-slot=table-container]]:shadow-none!',
				'[&_[data-slot=table-header]]:sticky [&_[data-slot=table-header]]:top-0 [&_[data-slot=table-header]]:z-10',
			)}
		>
			<DataTable<DisplayRow>
				size="sm"
				columns={columns}
				data={displayRows}
				expansion={(displayRow) => (displayRow.kind === 'row' ? renderExpansion(displayRow.row) : null)}
				aria-label={header}
				getRowId={(displayRow) => (displayRow.kind === 'row' ? displayRow.row.id : displayRow.id)}
				loading={isPending}
			/>
		</div>
	);
};

export {ComposedCell};
