/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {describe, expect, it} from 'vitest';
import {
	INITIAL_PAGE_CURSOR,
	cursorPageRequest,
	getNextCursorPageParam,
	getPreviousCursorPageParam,
} from './cursorPagination';

describe('cursorPagination', () => {
	it('should start in the forward direction with no cursor', () => {
		expect(INITIAL_PAGE_CURSOR).toEqual({cursor: undefined, direction: 'forward'});
	});

	it('should build a forward page request using the after cursor', () => {
		// given
		const pageParam = {cursor: 'end-1', direction: 'forward' as const};

		// when
		const pageRequest = cursorPageRequest(pageParam, 50);

		// then
		expect(pageRequest).toEqual({limit: 50, after: 'end-1'});
	});

	it('should build a backward page request using the before cursor', () => {
		// given
		const pageParam = {cursor: 'start-1', direction: 'backward' as const};

		// when
		const pageRequest = cursorPageRequest(pageParam, 50);

		// then
		expect(pageRequest).toEqual({limit: 50, before: 'start-1'});
	});

	it('should build the first page request with neither after nor before', () => {
		// given
		const pageParam = INITIAL_PAGE_CURSOR;

		// when
		const pageRequest = cursorPageRequest(pageParam, 50);

		// then
		expect(pageRequest).toEqual({limit: 50});
	});

	it('should return the next forward cursor when more items exist', () => {
		// given
		const page = {startCursor: null, endCursor: 'end-1', hasMoreTotalItems: true};

		// when
		const nextPageParam = getNextCursorPageParam(page);

		// then
		expect(nextPageParam).toEqual({cursor: 'end-1', direction: 'forward'});
	});

	it('should return undefined for the next page when no more items exist', () => {
		// given
		const page = {startCursor: null, endCursor: 'end-1', hasMoreTotalItems: false};

		// when
		const nextPageParam = getNextCursorPageParam(page);

		// then
		expect(nextPageParam).toBeUndefined();
	});

	it('should return undefined for the next page when the end cursor is missing', () => {
		// given
		const page = {startCursor: null, endCursor: null, hasMoreTotalItems: true};

		// when
		const nextPageParam = getNextCursorPageParam(page);

		// then
		expect(nextPageParam).toBeUndefined();
	});

	it('should return the previous backward cursor when a start cursor exists', () => {
		// given
		const page = {startCursor: 'start-1'};

		// when
		const previousPageParam = getPreviousCursorPageParam(page);

		// then
		expect(previousPageParam).toEqual({cursor: 'start-1', direction: 'backward'});
	});

	it('should return undefined for the previous page on the first page', () => {
		// given
		const page = {startCursor: null};

		// when
		const previousPageParam = getPreviousCursorPageParam(page);

		// then
		expect(previousPageParam).toBeUndefined();
	});
});
