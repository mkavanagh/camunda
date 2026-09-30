/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {test, expect} from '#/pw-modules/test-extend';
import {http, HttpResponse} from 'msw';
import {
	deleteResourceRequestBodySchema,
	endpoints,
	queryProcessDefinitionsRequestBodySchema,
	queryProcessInstancesRequestBodySchema,
} from '@camunda/camunda-api-zod-schemas/8.11';
import {
	mockCurrentUserEndpoint,
	mockGetIncidentProcessInstanceStatisticsByErrorEndpoint,
	mockGetProcessDefinitionInstanceStatisticsEndpoint,
	mockLicenseEndpoint,
	mockQueryBatchOperationItemsEndpoint,
	mockQueryProcessDefinitionsEndpoint,
	mockQueryProcessInstancesEndpoint,
	mockSystemConfigurationEndpoint,
	mockCreateCancellationBatchOperationEndpoint,
	mockGetBatchOperationEndpoint,
	mockGetProcessDefinitionXmlEndpoint,
	mockGetProcessInstanceCallHierarchyEndpoint,
	mockGetProcessInstanceEndpoint,
	mockGetProcessInstanceWaitStateStatisticsEndpoint,
	mockQueryProcessInstanceIncidentsEndpoint,
	mockDeleteResourceEndpoint,
	mockGetProcessDefinitionStatisticsEndpoint,
} from '#/shared-test-modules/mock-handlers';
import {createCurrentUser} from '#/shared-test-modules/api-mocks/current-user';
import {createLicense} from '#/shared-test-modules/api-mocks/license';
import {createSystemConfiguration} from '#/shared-test-modules/api-mocks/system-configuration';
import {
	createProcessDefinition,
	createQueryProcessDefinitionsResponse,
} from '#/shared-test-modules/api-mocks/process-definitions';
import {
	createProcessInstance,
	createQueryProcessInstancesResponse,
} from '#/shared-test-modules/api-mocks/process-instances';
import {createCallHierarchy} from '#/shared-test-modules/api-mocks/call-hierarchy';
import {
	createBatchOperationItem,
	createBatchOperation,
	createQueryBatchOperationItemsResponse,
} from '#/shared-test-modules/api-mocks/batch-operations';
import {createPaginatedResponse, createProblemDetails} from '#/shared-test-modules/api-mocks/shared';
import {createGetProcessDefinitionStatisticsResponse} from '#/shared-test-modules/api-mocks/process-definition-statistics';

const PROCESS_INSTANCE_XML =
	'<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="order-process"><callActivity id="call-activity" /></process></definitions>';

function getProcessInstanceShellHandlers({
	processInstance = createProcessInstance({
		processInstanceKey: '1001',
		processDefinitionName: 'Order Process',
		hasIncident: false,
	}),
	callHierarchy = [],
}: {
	processInstance?: ReturnType<typeof createProcessInstance>;
	callHierarchy?: ReturnType<typeof createCallHierarchy>[];
} = {}) {
	return [
		mockGetProcessInstanceEndpoint({
			successResponse: HttpResponse.json(processInstance),
		}),
		mockGetProcessInstanceCallHierarchyEndpoint({
			successResponse: HttpResponse.json(callHierarchy),
		}),
		mockGetProcessDefinitionXmlEndpoint({successResponse: HttpResponse.text(PROCESS_INSTANCE_XML)}),
	] as const;
}

test.beforeEach(({network}) => {
	network.use(
		mockCurrentUserEndpoint({
			successResponse: HttpResponse.json(createCurrentUser()),
		}),
		mockSystemConfigurationEndpoint({
			successResponse: HttpResponse.json(createSystemConfiguration({components: {active: ['operate']}})),
		}),
		mockLicenseEndpoint({
			successResponse: HttpResponse.json(createLicense()),
		}),
		mockGetProcessDefinitionInstanceStatisticsEndpoint({
			successResponse: HttpResponse.json(createPaginatedResponse()),
		}),
		mockGetIncidentProcessInstanceStatisticsByErrorEndpoint({
			successResponse: HttpResponse.json(createPaginatedResponse()),
		}),
		mockQueryProcessDefinitionsEndpoint({
			successResponse: HttpResponse.json(
				createQueryProcessDefinitionsResponse({
					items: [createProcessDefinition({name: 'Order Process', processDefinitionId: 'order-process'})],
				}),
			),
		}),
		mockQueryBatchOperationItemsEndpoint({
			successResponse: HttpResponse.json(createQueryBatchOperationItemsResponse()),
		}),
		mockQueryProcessInstancesEndpoint({
			successResponse: HttpResponse.json(
				createQueryProcessInstancesResponse({
					items: [
						createProcessInstance({processInstanceKey: '1001', processDefinitionName: 'Order Process'}),
						createProcessInstance({processInstanceKey: '1002', processDefinitionName: 'Payment Process'}),
					],
				}),
			),
		}),
		mockGetProcessInstanceWaitStateStatisticsEndpoint({
			successResponse: HttpResponse.json(createPaginatedResponse()),
		}),
	);
});

test.describe('Operate processes page', () => {
	test('should recover from a forbidden deletion, then delete without losing tenant or filters', async ({
		network,
		page,
		operateProcessesPage,
	}) => {
		const definition = createProcessDefinition({
			name: 'Order Process',
			processDefinitionId: 'order-process',
			processDefinitionKey: '2251799813685279',
			tenantId: 'tenant-a',
			version: 2,
		});
		network.use(
			mockQueryProcessDefinitionsEndpoint({
				schema: queryProcessDefinitionsRequestBodySchema.refine((body) => body.filter?.state === 'DRAINING'),
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
				failureResponse: HttpResponse.json(createQueryProcessDefinitionsResponse({items: [definition]})),
			}),
			mockQueryProcessInstancesEndpoint({
				schema: queryProcessInstancesRequestBodySchema.refine(
					(body) =>
						body.page?.limit === 0 &&
						typeof body.filter?.processDefinitionKey === 'object' &&
						body.filter.processDefinitionKey.$eq === definition.processDefinitionKey,
				),
				successResponse: HttpResponse.json(createQueryProcessInstancesResponse()),
				failureResponse: HttpResponse.json(createQueryProcessInstancesResponse()),
			}),
			mockGetProcessDefinitionXmlEndpoint({successResponse: HttpResponse.text('')}),
			mockGetProcessDefinitionStatisticsEndpoint({
				successResponse: HttpResponse.json(createGetProcessDefinitionStatisticsResponse([])),
			}),
			mockDeleteResourceEndpoint({successResponse: new HttpResponse(null, {status: 403})}),
		);
		await operateProcessesPage.goto('?process=order-process&version=2&tenantId=tenant-a&businessId=order-1');
		const action = page.getByRole('button', {name: 'Delete Process Definition "Order Process - Version 2"'});
		await expect(action).toBeEnabled();
		await action.click();
		await expect(page.getByRole('dialog')).toContainText('Order Process - Version 2');
		await expect(page.getByRole('dialog').getByRole('button', {name: 'Delete'})).toBeDisabled();
		await page.getByRole('dialog').getByText('Yes, I confirm I want to delete this process definition.').click();
		await page.getByRole('dialog').getByRole('button', {name: 'Delete'}).click();
		await expect(page.getByText("You don't have permission to perform this operation")).toBeVisible();
		await expect(action).toBeEnabled();
		expect(new URL(page.url()).searchParams.get('process')).toBe('order-process');

		network.use(
			mockDeleteResourceEndpoint({
				schema: deleteResourceRequestBodySchema.refine((body) => body?.deleteHistory === true),
				successResponse: HttpResponse.json({}),
				failureResponse: new HttpResponse(null, {status: 400}),
			}),
		);
		await action.click();
		await expect(page.getByRole('dialog').getByRole('button', {name: 'Delete'})).toBeDisabled();
		await page.getByRole('dialog').getByText('Yes, I confirm I want to delete this process definition.').click();
		const submitted = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				request.url().endsWith(`/v2/resources/${definition.processDefinitionKey}/deletion`),
		);
		const refreshed = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				request.url().endsWith('/v2/process-definitions/search') &&
				request.postDataJSON()?.filter?.tenantId === 'tenant-a',
		);
		await page.getByRole('dialog').getByRole('button', {name: 'Delete'}).click();
		expect((await submitted).postDataJSON()).toEqual({deleteHistory: true});
		await refreshed;
		await expect(page.getByText('Operation created', {exact: true})).toBeVisible();
		await expect(page).toHaveURL(/\/operate\/processes\?[^#]*tenantId=tenant-a/);
		expect(new URL(page.url()).searchParams.get('process')).toBe('order-process');
		expect(new URL(page.url()).searchParams.get('version')).toBe('2');
		expect(new URL(page.url()).searchParams.get('businessId')).toBe('order-1');
		network.use(
			mockQueryProcessDefinitionsEndpoint({
				schema: queryProcessDefinitionsRequestBodySchema.refine((body) => body.filter?.state === 'DRAINING'),
				successResponse: HttpResponse.json(
					createQueryProcessDefinitionsResponse({items: [{...definition, state: 'DRAINING'}]}),
				),
				failureResponse: HttpResponse.json(
					createQueryProcessDefinitionsResponse({items: [{...definition, state: 'DRAINING'}]}),
				),
			}),
		);
		await page.reload();
		await expect(page.getByText('Draining', {exact: true})).toBeVisible();
		await expect(action).not.toBeVisible();
		network.use(
			mockQueryProcessDefinitionsEndpoint({
				schema: queryProcessDefinitionsRequestBodySchema.refine((body) => body.filter?.state === 'DRAINING'),
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
				failureResponse: HttpResponse.json(
					createQueryProcessDefinitionsResponse({items: [{...definition, state: 'DELETED'}]}),
				),
			}),
		);
		const historyAction = page.getByRole('button', {
			name: 'Delete Process Definition History "Order Process - Version 2"',
		});
		await expect(historyAction).toBeEnabled({timeout: 15000});
		let historySubmissions = 0;
		network.use(
			http.post(endpoints.deleteResource.getUrl({resourceKey: ':resourceKey'}), () => {
				historySubmissions += 1;
				return HttpResponse.json({
					resourceKey: definition.processDefinitionKey,
					batchOperation: {
						batchOperationKey: `batch-${historySubmissions}`,
						batchOperationType: 'DELETE_PROCESS_DEFINITION',
					},
				});
			}),
			mockGetBatchOperationEndpoint({
				successResponse: HttpResponse.json(
					createBatchOperation({
						batchOperationKey: 'batch-1',
						batchOperationType: 'DELETE_PROCESS_DEFINITION',
						state: 'ACTIVE',
					}),
				),
			}),
		);
		await historyAction.click();
		await page
			.getByRole('dialog')
			.getByText('Yes, I confirm I want to permanently delete this process definition history.')
			.click();
		await page.getByRole('dialog').getByRole('button', {name: 'Delete'}).click();
		await expect(historyAction).toBeDisabled();
		expect(historySubmissions).toBe(1);
		network.use(
			mockGetBatchOperationEndpoint({
				successResponse: HttpResponse.json(
					createBatchOperation({
						batchOperationKey: 'batch-1',
						batchOperationType: 'DELETE_PROCESS_DEFINITION',
						state: 'FAILED',
					}),
				),
			}),
		);
		const retryHistory = page.getByRole('button', {
			name: 'The previous deletion failed. Retry deleting this process definition.',
		});
		await expect(retryHistory).toBeEnabled({timeout: 15000});
		await retryHistory.click();
		await page
			.getByRole('dialog')
			.getByText('Yes, I confirm I want to permanently delete this process definition history.')
			.click();
		await page.getByRole('dialog').getByRole('button', {name: 'Delete'}).click();
		await expect.poll(() => historySubmissions).toBe(2);
	});

	test('should cancel all matching instances and discard selection after acceptance', async ({
		network,
		page,
		operateProcessesPage,
	}) => {
		network.use(
			mockCreateCancellationBatchOperationEndpoint({
				successResponse: HttpResponse.json(
					{batchOperationKey: 'batch-op-1', batchOperationType: 'CANCEL_PROCESS_INSTANCE'},
					{status: 202},
				),
			}),
			mockGetBatchOperationEndpoint({successResponse: HttpResponse.json(createBatchOperation())}),
		);
		await operateProcessesPage.goto();
		await page.getByRole('checkbox', {name: 'Select all items'}).check({force: true});
		await page.getByRole('button', {name: 'Cancel', exact: true}).click();
		await expect(page.getByRole('dialog')).toContainText(
			'In case there are called instances, these will be canceled too.',
		);
		const submitted = page.waitForRequest(
			(request) => request.method() === 'POST' && request.url().endsWith('/v2/process-instances/cancellation'),
		);
		await page.getByRole('dialog').getByRole('button', {name: 'Apply'}).click();
		expect((await submitted).postDataJSON()).toEqual({
			filter: {
				$or: [
					{state: {$eq: 'ACTIVE'}, hasIncident: false},
					{state: {$eq: 'SUSPENDED'}},
					{hasIncident: true, state: {$neq: 'SUSPENDED'}},
				],
			},
		});
		await expect(page.getByText('The batch operation "Cancel Process Instance" has been started')).toBeVisible();
		await expect(page.getByRole('checkbox', {name: 'Select all items'})).not.toBeChecked();
	});

	test('should render the filters panel with the process combobox', async ({operateProcessesPage}) => {
		await operateProcessesPage.goto();

		await expect(operateProcessesPage.filtersPanel).toBeVisible();
		await expect(operateProcessesPage.processCombobox).toBeVisible();
	});

	test('should render the reset filters button disabled by default', async ({operateProcessesPage}) => {
		await operateProcessesPage.goto();

		await expect(operateProcessesPage.resetFiltersButton).toBeDisabled();
	});

	test('should list the matching process instances and link each one to its details page', async ({
		network,
		page,
		operateProcessesPage,
	}) => {
		network.use(...getProcessInstanceShellHandlers());
		await operateProcessesPage.goto();

		await expect(operateProcessesPage.instancesTable).toBeVisible();
		await expect(operateProcessesPage.instanceLink('1001')).toHaveAttribute('href', '/operate/processes/1001');
		await expect(operateProcessesPage.instanceLink('1002')).toHaveAttribute('href', '/operate/processes/1002');
		await operateProcessesPage.instanceLink('1001').click();
		await expect(page).toHaveURL('/operate/processes/1001/variables');
		await expect(page.getByRole('heading', {name: 'Operate Process Instance'})).toBeAttached();
		await expect(page.getByRole('cell', {name: '1001'})).toBeVisible();
	});

	test('should show operation states when filtering by a batch operation', async ({network, operateProcessesPage}) => {
		network.use(
			mockQueryBatchOperationItemsEndpoint({
				successResponse: HttpResponse.json(
					createQueryBatchOperationItemsResponse({
						items: [createBatchOperationItem({processInstanceKey: '1001', state: 'ACTIVE'})],
					}),
				),
			}),
		);

		await operateProcessesPage.goto('?batchOperationKey=2f5b1beb-cbeb-41c8-a2f0-4c0bcf76c4ee');

		await expect(operateProcessesPage.operationStateColumn).toBeVisible();
		await expect(operateProcessesPage.operationState('ACTIVE')).toBeVisible();
	});

	test('should render forbidden process-instance content when the instance request returns 403', async ({
		network,
		page,
	}) => {
		network.use(
			mockGetProcessInstanceEndpoint({
				successResponse: HttpResponse.json(createProblemDetails({status: 403}), {status: 403}),
			}),
		);

		await page.goto('/operate/processes/1001');

		await expect(page).toHaveURL('/operate/processes/1001');
		await expect(page.getByText('403 - You do not have permission to view this information')).toBeVisible({
			timeout: 15000,
		});
		await expect(page.getByText('Contact your administrator to get access.')).toBeVisible();
		await expect(page.getByRole('link', {name: 'Learn more about permissions'})).toHaveAttribute(
			'href',
			'https://docs.camunda.io/docs/self-managed/operate-deployment/operate-authentication/#resource-based-permissions',
		);
	});

	test('should show the incident count fetched from the incidents endpoint', async ({
		network,
		page,
		operateProcessesPage,
	}) => {
		network.use(
			mockQueryProcessInstanceIncidentsEndpoint({
				successResponse: HttpResponse.json({
					items: [],
					page: {totalItems: 4, startCursor: null, endCursor: null, hasMoreTotalItems: false},
				}),
			}),
			...getProcessInstanceShellHandlers({
				processInstance: createProcessInstance({
					processInstanceKey: '1001',
					processDefinitionName: 'Order Process',
					hasIncident: true,
				}),
			}),
		);

		await operateProcessesPage.goto();
		await operateProcessesPage.instanceLink('1001').click();

		await expect(page).toHaveURL('/operate/processes/1001/incidents');
		await expect(page.getByText('4 incidents')).toBeVisible();
	});

	test('should redirect unknown process-instance child paths to the default tab while preserving search params', async ({
		network,
		page,
	}) => {
		network.use(...getProcessInstanceShellHandlers());

		await page.goto('/operate/processes/1001/custom-tab?elementId=call-activity&isPlaceholder=true');

		await expect(page).toHaveURL('/operate/processes/1001/details?elementId=call-activity&isPlaceholder=true');
	});

	test('should show call-hierarchy overflow in a More menu and keep the current process breadcrumb', async ({
		network,
		page,
		operateProcessesPage,
	}) => {
		network.use(
			...getProcessInstanceShellHandlers({
				callHierarchy: [
					createCallHierarchy({processInstanceKey: '10', processDefinitionName: 'Root'}),
					createCallHierarchy({processInstanceKey: '11', processDefinitionName: 'Step 1'}),
					createCallHierarchy({processInstanceKey: '12', processDefinitionName: 'Step 2'}),
					createCallHierarchy({processInstanceKey: '13', processDefinitionName: 'Step 3'}),
					createCallHierarchy({processInstanceKey: '14', processDefinitionName: 'Step 4'}),
					createCallHierarchy({processInstanceKey: '15', processDefinitionName: 'Step 5'}),
					createCallHierarchy({processInstanceKey: '1001', processDefinitionName: 'Order Process'}),
				],
			}),
		);

		await operateProcessesPage.goto();
		await operateProcessesPage.instanceLink('1001').click();

		await expect(page.getByRole('button', {name: 'More'})).toBeVisible();
		await page.getByRole('button', {name: 'More'}).click();
		await expect(page.getByRole('menuitem', {name: 'Step 2'})).toBeVisible();
		await expect(page.getByLabel('Breadcrumb').getByText('Order Process')).toBeVisible();
	});

	test('should preserve search params when redirecting from process-instance shell to the default tab', async ({
		network,
		page,
	}) => {
		network.use(...getProcessInstanceShellHandlers());

		await page.goto('/operate/processes/1001?elementId=call-activity&isPlaceholder=true&customHint=focus');

		await expect(page).toHaveURL(/\/operate\/processes\/1001\/details\?/);
		const {searchParams} = new URL(page.url());
		expect(searchParams.get('elementId')).toBe('call-activity');
		expect(searchParams.get('isPlaceholder')).toBe('true');
		expect(searchParams.get('customHint')).toBe('focus');
		await expect(page.getByRole('heading', {name: 'Operate Process Instance'})).toBeAttached();
	});

	test('should recover waiting statistics before choosing the default tab', async ({
		network,
		page,
		operateProcessesPage,
	}) => {
		network.use(
			...getProcessInstanceShellHandlers({
				processInstance: createProcessInstance({
					processInstanceKey: '1001',
					processDefinitionId: 'order-process',
					processDefinitionName: 'Order Process',
					hasIncident: false,
				}),
			}),
		);

		for (const isCached of [false, true]) {
			network.use(
				mockGetProcessInstanceWaitStateStatisticsEndpoint({
					successResponse: HttpResponse.json(createProblemDetails({status: 503}), {status: 503}),
				}),
			);
			if (isCached) {
				await page.getByRole('link', {name: 'Processes', exact: true}).click();
				await operateProcessesPage.instanceLink('1001').click();
			} else {
				await page.goto('/operate/processes/1001');
			}
			await expect(page.getByRole('heading', {name: 'Something went wrong'})).toBeVisible({timeout: 15000});
			await expect(page).toHaveURL('/operate/processes/1001');
			await expect(page.getByText('Waiting', {exact: true})).toHaveCount(0);
			network.use(
				mockGetProcessInstanceWaitStateStatisticsEndpoint({
					successResponse: HttpResponse.json(
						createPaginatedResponse({items: [{elementId: 'order-process', waitingCount: 1}]}),
					),
				}),
			);
			await page.getByRole('button', {name: 'Try again'}).click();
			await expect(page).toHaveURL('/operate/processes/1001/details');
			await expect(page.getByText('Waiting', {exact: true})).toBeVisible();
		}
	});

	test('should hide start, end and called instances columns on reduced layouts', async ({network, page}) => {
		await page.setViewportSize({width: 1000, height: 900});
		network.use(
			...getProcessInstanceShellHandlers({
				processInstance: createProcessInstance({
					processInstanceKey: '1001',
					processDefinitionName: 'Order Process',
					endDate: '2026-01-15T12:00:00.000Z',
					hasIncident: false,
				}),
			}),
		);

		await page.goto('/operate/processes/1001');

		await expect(page).toHaveURL('/operate/processes/1001/variables');
		await expect(page.getByRole('columnheader', {name: 'Start Date'})).toHaveCount(0);
		await expect(page.getByRole('columnheader', {name: 'End Date'})).toHaveCount(0);
		await expect(page.getByRole('columnheader', {name: 'Called Instances'})).toHaveCount(0);
	});
});
