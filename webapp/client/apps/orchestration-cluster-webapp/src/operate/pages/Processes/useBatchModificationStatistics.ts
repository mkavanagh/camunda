/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {skipToken, useQuery} from '@tanstack/react-query';
import type {
	CreateCancellationBatchOperationRequestBody,
	GetProcessDefinitionStatisticsRequestBody,
	GetProcessDefinitionStatisticsResponseBody,
} from '@camunda/camunda-api-zod-schemas/8.11';
import {endpoints} from '#/shared/http/endpoints';
import {request} from '#/shared/http/request';
import {mapQueryError} from '#/shared/http/mapQueryError';

type BatchModificationScope = {
	filter: CreateCancellationBatchOperationRequestBody['filter'];
	selectedCount: number;
};

function useBatchModificationStatistics({
	definitionKey,
	sourceElementId,
	scope,
}: {
	definitionKey?: string;
	sourceElementId?: string;
	scope?: BatchModificationScope;
}) {
	const {processDefinitionId, processDefinitionVersion, businessId, ...selectionFilter} = scope?.filter ?? {};
	const statisticsFilter = {
		...selectionFilter,
		state: {$eq: 'ACTIVE'},
		elementId: sourceElementId ? {$eq: sourceElementId} : undefined,
	} satisfies GetProcessDefinitionStatisticsRequestBody['filter'];
	const query = useQuery({
		queryKey: ['batchModificationStatistics', definitionKey, statisticsFilter],
		enabled:
			scope?.filter.businessId === undefined &&
			definitionKey !== undefined &&
			sourceElementId !== undefined &&
			(scope?.selectedCount ?? 0) > 0,
		queryFn:
			definitionKey === undefined
				? skipToken
				: async (): Promise<GetProcessDefinitionStatisticsResponseBody> => {
						const {response, error} = await request(
							endpoints.getProcessDefinitionStatistics({processDefinitionKey: definitionKey, filter: statisticsFilter}),
						);
						if (error !== null) {
							throw mapQueryError(error);
						}
						return response.json();
					},
		refetchInterval: 5000,
	});
	const sourceStatistics = query.data?.items.find(({elementId}) => elementId === sourceElementId);
	return {
		isUnavailable: scope?.filter.businessId !== undefined,
		isError: query.isError && scope?.filter.businessId === undefined,
		refetch: query.refetch,
		count:
			scope?.filter.businessId !== undefined || query.isError || query.isPending || query.data === undefined
				? undefined
				: (sourceStatistics?.active ?? 0) + (sourceStatistics?.incidents ?? 0),
	};
}

export {useBatchModificationStatistics};
export type {BatchModificationScope};
