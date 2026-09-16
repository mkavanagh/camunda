/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {infiniteQueryOptions, queryOptions} from '@tanstack/react-query';
import type {
	GetIncidentProcessInstanceStatisticsByErrorResponseBody,
	GetIncidentProcessInstanceStatisticsByDefinitionResponseBody,
} from '@camunda/camunda-api-zod-schemas/8.11';
import {request} from '#/shared/http/request';
import {mapQueryError} from '#/shared/http/mapQueryError';
import {endpoints} from '#/shared/http/endpoints';

const PAGE_SIZE = 50;
const MAX_PAGES = 5;

// This endpoint only supports offset pagination (`from`/`limit`), not the
// cursor-based `after`/`before` style other search endpoints use — its
// `startCursor`/`endCursor` are always null, so `getNextPageParam` derives
// the next page directly from the offset and `totalItems` instead.
const incidentsByErrorInfiniteQuery = () =>
	infiniteQueryOptions({
		queryKey: ['incidentsByError'] as const,
		queryFn: async ({pageParam}): Promise<GetIncidentProcessInstanceStatisticsByErrorResponseBody> => {
			const {response, error} = await request(
				endpoints.getIncidentProcessInstanceStatisticsByError({
					page: {from: pageParam, limit: PAGE_SIZE},
				}),
			);
			if (error !== null) {
				throw mapQueryError(error);
			}
			return response.json();
		},
		initialPageParam: 0,
		getNextPageParam: (lastPage, _allPages, lastPageParam) => {
			const nextOffset = lastPageParam + lastPage.items.length;
			return nextOffset < lastPage.page.totalItems ? nextOffset : undefined;
		},
		getPreviousPageParam: (_firstPage, _allPages, firstPageParam) =>
			firstPageParam > 0 ? Math.max(0, firstPageParam - PAGE_SIZE) : undefined,
		maxPages: MAX_PAGES,
	});

const incidentsByErrorDefinitionsQuery = (errorHashCode: number) =>
	queryOptions({
		queryKey: ['incidentsByErrorDefinitions', errorHashCode] as const,
		queryFn: async (): Promise<GetIncidentProcessInstanceStatisticsByDefinitionResponseBody> => {
			const {response, error} = await request(
				endpoints.getIncidentProcessInstanceStatisticsByDefinition({
					filter: {errorHashCode},
				}),
			);
			if (error !== null) {
				throw mapQueryError(error);
			}
			return response.json();
		},
	});

export {incidentsByErrorInfiniteQuery, incidentsByErrorDefinitionsQuery, PAGE_SIZE};
