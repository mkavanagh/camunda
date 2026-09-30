/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {HttpResponse} from 'msw';
import {test, expect} from '#/pw-modules/test-extend';
import {createCurrentUser} from '#/shared-test-modules/api-mocks/current-user';
import {createLicense} from '#/shared-test-modules/api-mocks/license';
import {createSystemConfiguration} from '#/shared-test-modules/api-mocks/system-configuration';
import {createPaginatedResponse} from '#/shared-test-modules/api-mocks/shared';
import {createQueryProcessDefinitionsResponse} from '#/shared-test-modules/api-mocks/process-definitions';
import {createQueryProcessInstancesResponse} from '#/shared-test-modules/api-mocks/process-instances';
import {
	mockCurrentUserEndpoint,
	mockSystemConfigurationEndpoint,
	mockLicenseEndpoint,
	mockQueryProcessDefinitionsEndpoint,
	mockQueryProcessInstancesEndpoint,
	mockGetProcessDefinitionInstanceStatisticsEndpoint,
	mockGetIncidentProcessInstanceStatisticsByErrorEndpoint,
} from '#/shared-test-modules/mock-handlers';

test('should have no accessibility violations in variable filters and their condition modal', async ({
	network,
	page,
	operateProcessesPage,
	makeAxeBuilder,
}) => {
	network.use(
		mockCurrentUserEndpoint({successResponse: HttpResponse.json(createCurrentUser())}),
		mockSystemConfigurationEndpoint({
			successResponse: HttpResponse.json(createSystemConfiguration({components: {active: ['operate']}})),
		}),
		mockLicenseEndpoint({successResponse: HttpResponse.json(createLicense())}),
		mockGetProcessDefinitionInstanceStatisticsEndpoint({successResponse: HttpResponse.json(createPaginatedResponse())}),
		mockGetIncidentProcessInstanceStatisticsByErrorEndpoint({
			successResponse: HttpResponse.json(createPaginatedResponse()),
		}),
		mockQueryProcessDefinitionsEndpoint({successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse())}),
		mockQueryProcessInstancesEndpoint({successResponse: HttpResponse.json(createQueryProcessInstancesResponse())}),
	);
	const variable = encodeURIComponent(JSON.stringify([{name: 'status', operator: 'equals', value: '"open"'}]));
	await operateProcessesPage.goto(`?variable=${variable}`);
	await expect(page.getByRole('textbox', {name: 'Value'})).toBeVisible();
	expect((await makeAxeBuilder().analyze()).violations).toEqual([]);

	await page.getByRole('button', {name: 'Add condition'}).click();
	await expect(page.getByRole('dialog', {name: 'Filter by variable'})).toBeVisible();
	expect((await makeAxeBuilder().analyze()).violations).toEqual([]);
});
