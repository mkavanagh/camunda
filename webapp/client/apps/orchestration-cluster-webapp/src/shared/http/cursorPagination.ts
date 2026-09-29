/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

type PageCursor = {
	cursor: string | undefined;
	direction: 'forward' | 'backward';
};

const INITIAL_PAGE_CURSOR: PageCursor = {cursor: undefined, direction: 'forward'};

function cursorPageRequest(pageParam: PageCursor, limit: number): {limit: number; after?: string; before?: string} {
	return {
		limit,
		...(pageParam.direction === 'forward' ? {after: pageParam.cursor} : {before: pageParam.cursor}),
	};
}

function getNextCursorPageParam(page: {endCursor: string | null; hasMoreTotalItems: boolean}): PageCursor | undefined {
	return page.hasMoreTotalItems && page.endCursor !== null ? {cursor: page.endCursor, direction: 'forward'} : undefined;
}

function getPreviousCursorPageParam(page: {startCursor: string | null}): PageCursor | undefined {
	return page.startCursor !== null ? {cursor: page.startCursor, direction: 'backward'} : undefined;
}

export {type PageCursor, INITIAL_PAGE_CURSOR, cursorPageRequest, getNextCursorPageParam, getPreviousCursorPageParam};
