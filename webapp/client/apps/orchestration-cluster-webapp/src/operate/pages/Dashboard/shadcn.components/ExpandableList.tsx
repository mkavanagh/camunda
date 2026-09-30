/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import React, {useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import SvgErrorRobot from '#/shared/svg/ErrorRobot';
import {EmptyState} from '#/operate/components/EmptyState/shadcn.components/EmptyState';
import type {ExpandableListRow} from './ExpandableList.types';
import {
	DEFAULT_EXPANDABLE_LIST_VARIANT,
	EXPANDABLE_LIST_VARIANTS,
	type ExpandableListVariant,
} from './ExpandableList.variants';

type RowHeightEntry = {isDetailRow: boolean; height: number};

// Scoped to the table body (excludes the header row, which shares the same
// `data-slot`). Includes both real rows and any expansion/detail rows
// rendered alongside them: the DS `expansion` prop marks those with
// `data-table-expansion-row`, and the `nativeExpansion` variant marks its
// own detail rows with `data-row-kind="detail"` since it renders them
// through the same row primitive as real data rows.
const readRowHeightEntries = (container: HTMLElement): RowHeightEntry[] => {
	const tbodyRowElements = container.querySelectorAll<HTMLElement>(
		'[data-slot="table-body"] [data-slot="table-row"], [data-slot="table-body"] [data-slot="data-table-expansion-row"]',
	);

	return Array.from(tbodyRowElements).map((rowElement) => ({
		isDetailRow:
			rowElement.getAttribute('data-slot') === 'data-table-expansion-row' ||
			rowElement.querySelector('[data-row-kind="detail"]') !== null,
		height: rowElement.getBoundingClientRect().height,
	}));
};

// Sums the height of entries up to (and including any detail row belonging
// to) the first `targetRealRowCount` real rows. Walking in order rather than
// taking a fixed slice means a row that is still expanded from before it
// was prepended/evicted contributes its detail row's height too, keeping
// the anchor row's own position accurate.
const sumRealRowHeights = (entries: RowHeightEntry[], targetRealRowCount: number): number => {
	let total = 0;
	let realRowsSeen = 0;

	for (const entry of entries) {
		if (!entry.isDetailRow) {
			if (realRowsSeen >= targetRealRowCount) {
				break;
			}

			realRowsSeen += 1;
		}

		total += entry.height;
	}

	return total;
};

type Props = {
	isPending: boolean;
	isError: boolean;
	emptyState?: React.ReactNode;
	listTestId: string;
	dataTestId: string;
	header: string;
	rows: ExpandableListRow[];
	expandedContents: Record<string, React.ReactElement<{tabIndex: number}>>;
	variant?: ExpandableListVariant;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
	isFetchingNextPage: boolean;
	isFetchingPreviousPage: boolean;
	onLoadNextPage: () => void;
	onLoadPreviousPage: () => void;
};

const ExpandableList: React.FC<Props> = ({
	isPending,
	isError,
	emptyState,
	listTestId,
	dataTestId,
	header,
	rows,
	expandedContents,
	hasNextPage,
	hasPreviousPage,
	isFetchingNextPage,
	isFetchingPreviousPage,
	onLoadNextPage,
	onLoadPreviousPage,
	variant = DEFAULT_EXPANDABLE_LIST_VARIANT,
}) => {
	const {t} = useTranslation();

	const [scrollContainer, setScrollContainerState] = useState<HTMLDivElement | null>(null);
	const [topSentinel, setTopSentinel] = useState<HTMLDivElement | null>(null);
	const [bottomSentinel, setBottomSentinel] = useState<HTMLDivElement | null>(null);

	const scrollContainerElementRef = useRef<HTMLDivElement | null>(null);
	const setScrollContainer = useCallback((node: HTMLDivElement | null) => {
		scrollContainerElementRef.current = node;
		setScrollContainerState(node);
	}, []);

	const previousRowIdsBeforePrependRef = useRef<Set<string> | null>(null);
	// Height already compensated for below (skeleton-insertion effect) that
	// the row-swap effect further down must subtract back out, so the two
	// don't double-compensate for the same inserted space.
	const previousSkeletonCompensationRef = useRef(0);
	const loadingPreviousTestId = `${listTestId}-loading-previous`;

	// Mirrors `previousRowIdsBeforePrependRef` but for the opposite
	// direction: tracks the row ids (in order) and their rendered heights
	// just before a next-page fetch, so the reconciliation effect below can
	// tell how many of them were evicted from the front (react-query's
	// `maxPages` cap can do this while appending at the back) and restore
	// the equivalent height to `scrollTop`, since those rows' own DOM nodes
	// are gone by the time the eviction is visible in `rows`.
	const rowIdsBeforeAppendRef = useRef<string[] | null>(null);
	const rowHeightEntriesBeforeAppendRef = useRef<RowHeightEntry[] | null>(null);

	const handleTopSentinelIntersect = useEffectEvent(() => {
		if (isFetchingPreviousPage || isFetchingNextPage) {
			return false;
		}

		previousRowIdsBeforePrependRef.current = new Set(rows.map((row) => row.id));
		onLoadPreviousPage();
		return true;
	});

	const handleBottomSentinelIntersect = useEffectEvent(() => {
		if (isFetchingNextPage || isFetchingPreviousPage) {
			return false;
		}

		const container = scrollContainerElementRef.current;

		if (container !== null) {
			rowHeightEntriesBeforeAppendRef.current = readRowHeightEntries(container);
		}

		rowIdsBeforeAppendRef.current = rows.map((row) => row.id);
		onLoadNextPage();
		return true;
	});

	useEffect(() => {
		if (!topSentinel && !bottomSentinel) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				let hasTriggeredFetch = false;

				for (const entry of entries) {
					if (!entry.isIntersecting || hasTriggeredFetch) {
						continue;
					}

					if (entry.target === topSentinel) {
						hasTriggeredFetch = handleTopSentinelIntersect();
					} else if (entry.target === bottomSentinel) {
						hasTriggeredFetch = handleBottomSentinelIntersect();
					}
				}
			},
			{root: scrollContainer},
		);

		if (topSentinel) {
			observer.observe(topSentinel);
		}

		if (bottomSentinel) {
			observer.observe(bottomSentinel);
		}

		return () => observer.disconnect();
	}, [scrollContainer, topSentinel, bottomSentinel]);

	useLayoutEffect(() => {
		const container = scrollContainerElementRef.current;

		if (container === null || !isFetchingPreviousPage || previousSkeletonCompensationRef.current !== 0) {
			return;
		}

		// The variant mounts a loading-skeleton row as the first table row as
		// soon as `isFetchingPreviousPage` flips on, before any real rows are
		// prepended. Left uncompensated, that insertion alone pushes every
		// already-visible row down by its height, so the reading position the
		// user was scrolled to jumps the instant the fetch starts. Push
		// `scrollTop` down by the same amount immediately so the currently
		// visible rows stay put; the effect below reconciles this once the
		// skeleton row is replaced by the real prepended rows.
		const skeletonRow = container.querySelector(`[data-testid="${loadingPreviousTestId}"]`);
		const skeletonHeight = skeletonRow?.closest('[data-slot="table-row"]')?.getBoundingClientRect().height ?? 0;

		if (skeletonHeight === 0) {
			return;
		}

		container.scrollTop += skeletonHeight;
		previousSkeletonCompensationRef.current = skeletonHeight;
	}, [isFetchingPreviousPage, loadingPreviousTestId]);

	useLayoutEffect(() => {
		const container = scrollContainerElementRef.current;
		const previousRowIds = previousRowIdsBeforePrependRef.current;

		if (container === null || previousRowIds === null || isFetchingPreviousPage) {
			return;
		}

		// The backing infinite queries cap their page window (react-query's
		// `maxPages`), so a previous-page fetch can evict a page from the
		// bottom while prepending one at the top: total scrollHeight then
		// stays flat even though content shifted. Measure only the DOM height
		// that was actually inserted above the first still-existing ("anchor")
		// row instead of the total height delta, so the viewport stays
		// anchored on the previously-visible rows regardless of what was
		// evicted at the other end.
		const firstExistingRowIndex = rows.findIndex((row) => previousRowIds.has(row.id));
		const prependedRowCount = firstExistingRowIndex === -1 ? rows.length : firstExistingRowIndex;
		const prependedHeight = sumRealRowHeights(readRowHeightEntries(container), prependedRowCount);

		// Subtract back out the skeleton-height compensation already applied
		// above: that earlier bump anchored the view to the skeleton's
		// (transient) position, so only the remainder of `prependedHeight`
		// still needs to be applied now that real rows have replaced it.
		container.scrollTop += prependedHeight - previousSkeletonCompensationRef.current;
		previousSkeletonCompensationRef.current = 0;
		previousRowIdsBeforePrependRef.current = null;
	}, [rows, isFetchingPreviousPage, scrollContainer]);

	useLayoutEffect(() => {
		const container = scrollContainerElementRef.current;
		const previousRowIds = rowIdsBeforeAppendRef.current;
		const previousRowHeightEntries = rowHeightEntriesBeforeAppendRef.current;

		if (container === null || previousRowIds === null || previousRowHeightEntries === null || isFetchingNextPage) {
			return;
		}

		// Mirrors the previous-page effect above for the opposite direction:
		// a next-page fetch can evict the oldest page from the front while
		// appending the new one at the back. Those evicted rows sat above
		// whatever's currently visible, so removing them without
		// compensation would silently scroll the visible rows further down
		// the list once `scrollTop` is measured against the now-shorter
		// content above it. Their own DOM nodes are gone by now, so use the
		// heights captured just before the fetch started instead of
		// re-reading the (now current) DOM.
		const newRowIds = new Set(rows.map((row) => row.id));
		const firstSurvivingRowIndex = previousRowIds.findIndex((id) => newRowIds.has(id));
		const evictedRowCount = firstSurvivingRowIndex === -1 ? previousRowIds.length : firstSurvivingRowIndex;

		if (evictedRowCount > 0) {
			container.scrollTop -= sumRealRowHeights(previousRowHeightEntries, evictedRowCount);
		}

		rowIdsBeforeAppendRef.current = null;
		rowHeightEntriesBeforeAppendRef.current = null;
	}, [rows, isFetchingNextPage, scrollContainer]);

	if (!isPending) {
		if (isError) {
			return (
				<EmptyState
					icon={<SvgErrorRobot aria-hidden />}
					heading={t('operate.dashboard.fetchErrorHeading')}
					description={t('operate.dashboard.fetchErrorDescription')}
				/>
			);
		}

		if (emptyState !== undefined) {
			return <>{emptyState}</>;
		}
	}

	const renderExpansion = (row: ExpandableListRow) => {
		const content = expandedContents[row.id];
		return content ? React.cloneElement(content, {tabIndex: 0}) : null;
	};

	const Variant = EXPANDABLE_LIST_VARIANTS[variant];

	return (
		// `overflow-anchor:none` disables the browser's own CSS scroll
		// anchoring on this container. Left enabled, it independently
		// readjusts `scrollTop` whenever content is inserted or removed
		// off-screen above the viewport (exactly what the effects above
		// already do by hand for prepended/evicted rows on both ends), so
		// both mechanisms would compensate the same change and the
		// container ends up scrolled further than intended.
		//
		// The rounded card border/background normally lives on the DS
		// DataTable's own internal container, but that container scrolls
		// along with its content here (see `ComposedCell`/`NativeExpansionCell`
		// for why it can't own the scrolling itself). Once scrolled, its top
		// edge — and the rounded corner on it — scrolls out of view, leaving
		// the sticky header's square corners exposed with nothing rounding
		// them off. This outer container is the one true scroll viewport that
		// never moves, so hosting the rounded card chrome here instead keeps
		// it visible at the same on-screen position regardless of scroll
		// position; the variants strip the DS container's own copy of these
		// classes to avoid a redundant, now-mid-content border.
		<div
			className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-xl border bg-neutral-background-subtle shadow-sm [overflow-anchor:none]"
			ref={setScrollContainer}
			data-testid={listTestId}
		>
			{hasPreviousPage && <div ref={setTopSentinel} data-testid={`${listTestId}-top-sentinel`} />}
			<div data-testid={dataTestId}>
				<Variant
					header={header}
					rows={rows}
					renderExpansion={renderExpansion}
					isPending={isPending}
					isFetchingNextPage={isFetchingNextPage}
					isFetchingPreviousPage={isFetchingPreviousPage}
					loadingNextPage={{
						testId: `${listTestId}-loading-next`,
						label: t('operate.dashboard.loadingMoreRows', {header}),
					}}
					loadingPreviousPage={{
						testId: loadingPreviousTestId,
						label: t('operate.dashboard.loadingPreviousRows', {header}),
					}}
				/>
			</div>
			{hasNextPage && <div ref={setBottomSentinel} data-testid={`${listTestId}-bottom-sentinel`} />}
		</div>
	);
};

export {ExpandableList};
// TODO(#63423, #63424): delete once InstancesByProcess/IncidentsByError land in PR8
export type {ExpandableListRow};
