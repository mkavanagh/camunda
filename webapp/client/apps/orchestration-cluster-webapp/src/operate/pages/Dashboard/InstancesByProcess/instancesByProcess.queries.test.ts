/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {describe, expect, it} from 'vitest';
import type {GetProcessDefinitionInstanceStatisticsResponseBody} from '@camunda/camunda-api-zod-schemas/8.11';
import {instancesByProcessInfiniteQuery, PAGE_SIZE} from './instancesByProcess.queries';

const createPage = ({
	itemCount,
	totalItems,
}: {
	itemCount: number;
	totalItems: number;
}): GetProcessDefinitionInstanceStatisticsResponseBody =>
	({
		items: Array.from({length: itemCount}, (_, index) => ({processDefinitionId: `process-${index}`})),
		page: {totalItems},
	}) as unknown as GetProcessDefinitionInstanceStatisticsResponseBody;

describe('instancesByProcessInfiniteQuery', () => {
	it('returns the next offset when there are more items and progress was made', () => {
		// given
		const query = instancesByProcessInfiniteQuery();
		const lastPage = createPage({itemCount: PAGE_SIZE, totalItems: PAGE_SIZE * 3});

		// when
		const nextPageParam = query.getNextPageParam(lastPage, [lastPage], 0, [0]);

		// then
		expect(nextPageParam).toBe(PAGE_SIZE);
	});

	it('returns undefined when the last page has been reached', () => {
		// given
		const query = instancesByProcessInfiniteQuery();
		const lastPageParam = PAGE_SIZE * 2;
		const lastPage = createPage({itemCount: 12, totalItems: lastPageParam + 12});

		// when
		const nextPageParam = query.getNextPageParam(lastPage, [lastPage], lastPageParam, [lastPageParam]);

		// then
		expect(nextPageParam).toBeUndefined();
	});

	it('returns undefined when the page is empty even if total items suggest more data', () => {
		// given
		const query = instancesByProcessInfiniteQuery();
		const lastPageParam = PAGE_SIZE;
		const lastPage = createPage({itemCount: 0, totalItems: PAGE_SIZE * 3});

		// when
		const nextPageParam = query.getNextPageParam(lastPage, [lastPage], lastPageParam, [lastPageParam]);

		// then
		expect(nextPageParam).toBeUndefined();
	});

	it('returns the previous offset while staying non-negative', () => {
		// given
		const query = instancesByProcessInfiniteQuery();
		const firstPage = createPage({itemCount: PAGE_SIZE, totalItems: PAGE_SIZE * 3});
		const firstPageParam = PAGE_SIZE + 10;

		// when
		const previousPageParam = query.getPreviousPageParam(firstPage, [firstPage], firstPageParam, [firstPageParam]);

		// then
		expect(previousPageParam).toBe(10);
	});

	it('returns undefined for previous page on the first page', () => {
		// given
		const query = instancesByProcessInfiniteQuery();
		const firstPage = createPage({itemCount: PAGE_SIZE, totalItems: PAGE_SIZE * 3});

		// when
		const previousPageParam = query.getPreviousPageParam(firstPage, [firstPage], 0, [0]);

		// then
		expect(previousPageParam).toBeUndefined();
	});
});
