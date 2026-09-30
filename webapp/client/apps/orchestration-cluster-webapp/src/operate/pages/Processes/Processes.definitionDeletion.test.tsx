/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {afterEach, beforeEach, describe, expect} from 'vitest';
import {http, HttpResponse} from 'msw';
import {endpoints, queryProcessDefinitionsRequestBodySchema} from '@camunda/camunda-api-zod-schemas/8.11';
import {it} from '#/vitest-modules/test-extend';
import {renderWithRouter} from '#/vitest-modules/render-with-router';
import {
	mockGetProcessDefinitionStatisticsEndpoint,
	mockGetProcessDefinitionXmlEndpoint,
	mockQueryProcessInstancesEndpoint,
} from '#/shared-test-modules/mock-handlers';
import {
	createProcessDefinition,
	createQueryProcessDefinitionsResponse,
} from '#/shared-test-modules/api-mocks/process-definitions';
import {createQueryProcessInstancesResponse} from '#/shared-test-modules/api-mocks/process-instances';
import {createSystemConfiguration} from '#/shared-test-modules/api-mocks/system-configuration';
import {createGetProcessDefinitionStatisticsResponse} from '#/shared-test-modules/api-mocks/process-definition-statistics';
import {ProcessesHarness} from './ProcessesHarness';

const DEFINITION = createProcessDefinition({
	name: 'Order Process',
	processDefinitionId: 'order-process',
	tenantId: 'tenant-a',
	version: 2,
});
const OTHER_TENANT = createProcessDefinition({
	...DEFINITION,
	tenantId: 'tenant-b',
	processDefinitionKey: '2251799813685280',
});

describe('Processes definition deletion tenant identity', () => {
	beforeEach(() => {
		sessionStorage.setItem('clientConfig', JSON.stringify(createSystemConfiguration()));
	});

	afterEach(() => {
		sessionStorage.removeItem('clientConfig');
	});

	it.for([
		{tenantId: undefined, isAmbiguous: true},
		{tenantId: 'tenant-a', isAmbiguous: false},
	] as const)(
		'should disable deletion for duplicate versions unless tenant $tenantId is selected',
		async ({tenantId, isAmbiguous}, {worker}) => {
			worker.use(
				http.post(endpoints.queryProcessDefinitions.getUrl(), async ({request}) => {
					const body = queryProcessDefinitionsRequestBodySchema.parse(await request.json());
					if (body.filter?.state === 'DRAINING') {
						return HttpResponse.json(createQueryProcessDefinitionsResponse());
					}
					if (body.filter?.processDefinitionId !== undefined) {
						expect(body.filter.processDefinitionId).toEqual({$eq: 'order-process'});
						expect(body.filter.version).toBe(2);
						expect(body.page?.limit).toBe(2);
						expect(body.filter.tenantId).toBe(tenantId);
						return HttpResponse.json(
							createQueryProcessDefinitionsResponse({
								items: tenantId === 'tenant-a' ? [DEFINITION] : [DEFINITION, OTHER_TENANT],
							}),
						);
					}
					return HttpResponse.json(
						createQueryProcessDefinitionsResponse({
							items: [DEFINITION],
							page: {totalItems: 1001, hasMoreTotalItems: true},
						}),
					);
				}),
				mockQueryProcessInstancesEndpoint({successResponse: HttpResponse.json(createQueryProcessInstancesResponse())}),
				mockGetProcessDefinitionXmlEndpoint({successResponse: HttpResponse.text('')}),
				mockGetProcessDefinitionStatisticsEndpoint({
					successResponse: HttpResponse.json(createGetProcessDefinitionStatisticsResponse([])),
				}),
			);
			const search = new URLSearchParams({process: 'order-process', version: '2'});
			if (tenantId !== undefined) {
				search.set('tenantId', tenantId);
			}
			const screen = await renderWithRouter(ProcessesHarness, {
				path: '/operate/processes',
				initialEntry: `/operate/processes?${search.toString()}`,
			});

			if (isAmbiguous) {
				await expect
					.element(
						screen.getByRole('button', {
							name: 'Cannot identify a unique process definition. Select a tenant or narrow the selection before deleting.',
						}),
					)
					.toBeDisabled();
			} else {
				await expect
					.element(screen.getByRole('button', {name: 'Delete Process Definition "Order Process - Version 2"'}))
					.toBeEnabled();
			}
		},
	);
});
