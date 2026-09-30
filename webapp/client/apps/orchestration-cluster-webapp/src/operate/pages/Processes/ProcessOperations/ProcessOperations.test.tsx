/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {afterEach, beforeEach, describe, expect, vi} from 'vitest';
import {userEvent} from 'vitest/browser';
import {http, HttpResponse} from 'msw';
import {
	deleteResourceRequestBodySchema,
	endpoints,
	queryProcessDefinitionsRequestBodySchema,
	queryProcessInstancesRequestBodySchema,
	type DeleteResourceResponseBody,
} from '@camunda/camunda-api-zod-schemas/8.11';
import {it} from '#/vitest-modules/test-extend';
import {renderWithRouter} from '#/vitest-modules/render-with-router';
import {
	mockDeleteResourceEndpoint,
	mockGetBatchOperationEndpoint,
	mockQueryProcessInstancesEndpoint,
} from '#/shared-test-modules/mock-handlers';
import {
	createProcessDefinition,
	createQueryProcessDefinitionsResponse,
} from '#/shared-test-modules/api-mocks/process-definitions';
import {createQueryProcessInstancesResponse} from '#/shared-test-modules/api-mocks/process-instances';
import {createBatchOperation} from '#/shared-test-modules/api-mocks/batch-operations';
import {Notifications} from '#/shared/notifications/components/Notifications';
import {notificationsStore} from '#/shared/notifications/notifications.store';
import {ProcessOperations} from './ProcessOperations';

const DEFINITION = createProcessDefinition({
	name: 'Order Process',
	processDefinitionId: 'order-process',
	processDefinitionKey: '2251799813685279',
	tenantId: 'tenant-a',
	version: 2,
});
const INITIAL_ENTRY =
	'/operate/processes?process=order-process&version=2&tenantId=tenant-a&businessId=order-1&active=false&completed=true';
const ACTION_NAME = 'Delete Process Definition "Order Process - Version 2"';
const CONFIRMATION = 'Yes, I confirm I want to delete this process definition.';
const ACCEPTED_HISTORY_KEY = 'operate:definitionDeletion:tenant-a:order-process:2:history';

function mockQueryProcessDefinitionsEndpoint({
	successResponse,
	identityResponse = HttpResponse.json(createQueryProcessDefinitionsResponse({items: [DEFINITION]})),
}: {
	successResponse: Response;
	identityResponse?: Response;
}) {
	return http.post(endpoints.queryProcessDefinitions.getUrl(), async ({request}) => {
		const body = queryProcessDefinitionsRequestBodySchema.parse(await request.json());
		if (body.filter?.processDefinitionId !== undefined) {
			return identityResponse.clone();
		}
		return successResponse.clone();
	});
}

function renderOperations(definition = DEFINITION, initialEntry = INITIAL_ENTRY) {
	return renderWithRouter(
		() => (
			<>
				<ProcessOperations definition={definition} />
				<Notifications />
			</>
		),
		{path: '/operate/processes', initialEntry},
	);
}

function mockCount(count = 0, delay?: number) {
	return mockQueryProcessInstancesEndpoint({
		schema: queryProcessInstancesRequestBodySchema.refine(
			(body) =>
				typeof body.filter?.processDefinitionKey === 'object' &&
				body.filter.processDefinitionKey.$eq === DEFINITION.processDefinitionKey &&
				body.filter?.$or?.some(
					(item) =>
						typeof item.state === 'object' &&
						item.state.$in?.includes('ACTIVE') &&
						item.state.$in?.includes('SUSPENDED'),
				) &&
				body.filter?.$or?.some((item) => item.hasIncident === true) &&
				body.page?.limit === 0,
		),
		successResponse: HttpResponse.json(createQueryProcessInstancesResponse({page: {totalItems: count}})),
		failureResponse: new HttpResponse(null, {status: 400}),
		delay,
	});
}

function deletionResponse(batchOperationKey?: string) {
	return HttpResponse.json({
		resourceKey: DEFINITION.processDefinitionKey,
		batchOperation: batchOperationKey ? {batchOperationKey, batchOperationType: 'DELETE_PROCESS_DEFINITION'} : null,
	} satisfies DeleteResourceResponseBody);
}

function mockDeletedDefinition() {
	return mockQueryProcessDefinitionsEndpoint({
		successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
		identityResponse: HttpResponse.json(
			createQueryProcessDefinitionsResponse({items: [{...DEFINITION, state: 'DELETED'}]}),
		),
	});
}

async function submit(
	screen: Awaited<ReturnType<typeof renderOperations>>,
	actionName = ACTION_NAME,
	confirmation = CONFIRMATION,
) {
	await expect.element(screen.getByRole('button', {name: actionName})).toBeEnabled();
	await userEvent.click(screen.getByRole('button', {name: actionName}));
	await userEvent.click(screen.getByText(confirmation));
	await userEvent.click(screen.getByRole('button', {name: 'Delete', exact: true}));
}

describe('<ProcessOperations />', () => {
	beforeEach(() => sessionStorage.removeItem(ACCEPTED_HISTORY_KEY));
	afterEach(() => {
		vi.restoreAllMocks();
		notificationsStore.reset();
		sessionStorage.removeItem(ACCEPTED_HISTORY_KEY);
	});

	it('should show the full warning and require fresh confirmation after cancel', async ({worker}) => {
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
			}),
			mockCount(),
		);
		const screen = await renderOperations();
		await userEvent.click(screen.getByRole('button', {name: ACTION_NAME}));

		await expect.element(screen.getByRole('heading', {name: 'Delete Process Definition'})).toBeVisible();
		await expect.element(screen.getByText('Order Process - Version 2')).toBeVisible();
		await expect.element(screen.getByText(/finished process instances will be deleted/)).toBeVisible();
		await expect.element(screen.getByText(/decision and process instances referenced/)).toBeVisible();
		await expect.element(screen.getByText(/user tasks, they will be deleted from Tasklist/)).toBeVisible();
		await expect
			.element(screen.getByRole('link', {name: /guide on deleting a process definition/}))
			.toHaveAttribute('href', 'https://docs.camunda.io/docs/components/operate/userguide/delete-resources/');
		await expect.element(screen.getByRole('button', {name: 'Delete', exact: true})).toBeDisabled();
		await userEvent.click(screen.getByText(CONFIRMATION));
		await userEvent.click(screen.getByRole('button', {name: 'Cancel', exact: true}));
		await userEvent.click(screen.getByRole('button', {name: ACTION_NAME}));
		await expect.element(screen.getByRole('checkbox', {name: CONFIRMATION})).not.toBeChecked();
		expect(screen.router.state.location.href).toBe(INITIAL_ENTRY);
	});

	it('should disable deletion while running instances exist or the count is loading', async ({worker}) => {
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
			}),
			mockCount(2, 350),
		);
		const screen = await renderOperations();
		await expect.element(screen.getByRole('button', {name: ACTION_NAME})).toBeDisabled();
		await expect
			.element(screen.getByRole('button', {name: 'Only process definitions without running instances can be deleted.'}))
			.toBeDisabled();
	});

	it('should fail closed when the draining lookup fails and recover on retry', async ({worker}) => {
		worker.use(
			mockQueryProcessDefinitionsEndpoint({successResponse: new HttpResponse(null, {status: 500})}),
			mockCount(),
		);
		const screen = await renderOperations();
		await expect
			.element(
				screen.getByRole('button', {name: 'Could not check the process definition status. Retry before deleting.'}),
			)
			.toBeDisabled();
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
			}),
		);
		await userEvent.click(screen.getByRole('button', {name: 'Retry checking definition status'}));
		await expect.element(screen.getByRole('button', {name: ACTION_NAME})).toBeEnabled();
	});

	it('should disable deletion when two tenants share an ID and version outside the first list page', async ({
		worker,
	}) => {
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
				identityResponse: HttpResponse.json(
					createQueryProcessDefinitionsResponse({
						items: [
							DEFINITION,
							createProcessDefinition({...DEFINITION, tenantId: 'tenant-b', processDefinitionKey: '2'}),
						],
					}),
				),
			}),
			mockCount(),
		);
		const screen = await renderOperations(
			DEFINITION,
			'/operate/processes?process=order-process&version=2&businessId=order-1',
		);
		await expect
			.element(
				screen.getByRole('button', {
					name: 'Cannot identify a unique process definition. Select a tenant or narrow the selection before deleting.',
				}),
			)
			.toBeDisabled();
	});

	it('should disable deletion after a cached exact-definition lookup fails', async ({worker}) => {
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
			}),
			mockCount(),
		);
		const screen = await renderOperations();
		await expect.element(screen.getByRole('button', {name: ACTION_NAME})).toBeEnabled();
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
				identityResponse: new HttpResponse(null, {status: 500}),
			}),
		);
		await screen.queryClient.invalidateQueries({queryKey: ['queryProcessDefinitions']});
		await expect
			.element(screen.getByRole('button', {name: 'Could not verify this process definition. Retry before deleting.'}))
			.toBeDisabled();
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
			}),
		);
		await userEvent.click(screen.getByRole('button', {name: 'Retry checking definition identity'}));
		await expect.element(screen.getByRole('button', {name: ACTION_NAME})).toBeEnabled();
	});

	it('should reveal history deletion when a cached draining definition becomes deleted', async ({worker}) => {
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(
					createQueryProcessDefinitionsResponse({items: [{...DEFINITION, state: 'DRAINING'}]}),
				),
				identityResponse: HttpResponse.json(
					createQueryProcessDefinitionsResponse({items: [{...DEFINITION, state: 'DRAINING'}]}),
				),
			}),
			mockCount(),
		);
		const screen = await renderOperations(createProcessDefinition({...DEFINITION, state: 'DRAINING'}));
		await expect.element(screen.getByText('Draining')).toBeVisible();
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(
					createQueryProcessDefinitionsResponse({items: [{...DEFINITION, state: 'DRAINING'}]}),
				),
				identityResponse: HttpResponse.json(
					createQueryProcessDefinitionsResponse({items: [{...DEFINITION, state: 'DELETED'}]}),
				),
			}),
		);
		await screen.queryClient.invalidateQueries({queryKey: ['queryProcessDefinitions']});
		await expect
			.element(screen.getByRole('button', {name: 'Delete Process Definition History "Order Process - Version 2"'}))
			.toBeEnabled();
		await userEvent.click(
			screen.getByRole('button', {name: 'Delete Process Definition History "Order Process - Version 2"'}),
		);
		await expect.element(screen.getByText(/permanently remove its remaining history/)).toBeVisible();
	});

	it('should prevent duplicate accepted history batches and allow retry after failure', async ({worker}) => {
		let submittedCount = 0;
		worker.use(
			mockDeletedDefinition(),
			mockCount(),
			http.post(endpoints.deleteResource.getUrl({resourceKey: ':resourceKey'}), () => {
				submittedCount += 1;
				return deletionResponse(`batch-${submittedCount}`);
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
		const screen = await renderOperations(createProcessDefinition({...DEFINITION, state: 'DELETED'}));
		const actionName = 'Delete Process Definition History "Order Process - Version 2"';
		const confirmation = 'Yes, I confirm I want to permanently delete this process definition history.';
		await submit(screen, actionName, confirmation);
		await expect.element(screen.getByText('Operation created', {exact: true})).toBeVisible();
		await expect.element(screen.getByRole('button', {name: actionName})).toBeDisabled();
		expect(submittedCount).toBe(1);

		worker.use(
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
		await screen.queryClient.invalidateQueries({queryKey: ['batchOperation', 'batch-1']});
		const retry = screen.getByRole('button', {
			name: 'The previous deletion failed. Retry deleting this process definition.',
		});
		await expect.element(retry).toBeEnabled();
		await userEvent.click(retry);
		await userEvent.click(screen.getByText(confirmation));
		await userEvent.click(screen.getByRole('button', {name: 'Delete', exact: true}));
		await expect.poll(() => submittedCount).toBe(2);
	});

	it('should restore an accepted history batch after remount and clear it after failure', async ({worker}) => {
		worker.use(
			mockDeletedDefinition(),
			mockCount(),
			mockDeleteResourceEndpoint({successResponse: deletionResponse('batch-1')}),
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
		const deleted = createProcessDefinition({...DEFINITION, state: 'DELETED'});
		const first = await renderOperations(deleted);
		const actionName = 'Delete Process Definition History "Order Process - Version 2"';
		await submit(first, actionName, 'Yes, I confirm I want to permanently delete this process definition history.');
		await expect.element(first.getByRole('button', {name: actionName})).toBeDisabled();
		await expect.poll(() => sessionStorage.getItem(ACCEPTED_HISTORY_KEY)).toBe('batch-1');
		await first.unmount();
		expect(sessionStorage.getItem(ACCEPTED_HISTORY_KEY)).toBe('batch-1');

		const second = await renderOperations(deleted);
		await expect.element(second.getByRole('button', {name: actionName})).toBeDisabled();
		worker.use(
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
		await second.queryClient.invalidateQueries({queryKey: ['batchOperation', 'batch-1']});
		await expect
			.element(
				second.getByRole('button', {name: 'The previous deletion failed. Retry deleting this process definition.'}),
			)
			.toBeEnabled();
		await expect.poll(() => sessionStorage.getItem(ACCEPTED_HISTORY_KEY)).toBeNull();
		await second.unmount();
		const third = await renderOperations(deleted);
		await expect.element(third.getByRole('button', {name: actionName})).toBeEnabled();
	});

	it('should fail closed when stored deletion progress cannot be read and recover after access returns', async ({
		worker,
	}) => {
		worker.use(mockDeletedDefinition(), mockCount());
		const originalGetItem = Storage.prototype.getItem;
		const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
			if (key.startsWith('operate:definitionDeletion:')) {
				throw new Error('Storage unavailable');
			}
			return originalGetItem.call(this, key);
		});
		const deleted = createProcessDefinition({...DEFINITION, state: 'DELETED'});
		const screen = await renderOperations(deleted);
		await expect
			.element(screen.getByText('Could not save deletion progress. Keep this tab open until the operation finishes.'))
			.toBeVisible();
		await expect
			.element(screen.getByRole('button', {name: 'Delete Process Definition History "Order Process - Version 2"'}))
			.toBeDisabled();
		getItem.mockRestore();
		await screen.unmount();
		const recovered = await renderOperations(deleted);
		await expect
			.element(recovered.getByRole('button', {name: 'Delete Process Definition History "Order Process - Version 2"'}))
			.toBeEnabled();
	});

	it('should fail closed on batch status errors and recover when the status can be checked', async ({worker}) => {
		worker.use(
			mockDeletedDefinition(),
			mockCount(),
			mockDeleteResourceEndpoint({successResponse: deletionResponse('batch-1')}),
			mockGetBatchOperationEndpoint({successResponse: HttpResponse.error()}),
		);
		const screen = await renderOperations(createProcessDefinition({...DEFINITION, state: 'DELETED'}));
		await submit(
			screen,
			'Delete Process Definition History "Order Process - Version 2"',
			'Yes, I confirm I want to permanently delete this process definition history.',
		);
		await expect
			.element(screen.getByRole('button', {name: 'Could not check deletion progress. Retry before deleting again.'}))
			.toBeDisabled();
		worker.use(
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
		await userEvent.click(screen.getByRole('button', {name: 'Retry checking deletion progress'}));
		await expect
			.element(
				screen.getByRole('button', {name: 'The previous deletion failed. Retry deleting this process definition.'}),
			)
			.toBeEnabled();
	});

	it('should block duplicate submissions and keep the selection while the operation is pending', async ({worker}) => {
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
			}),
			mockCount(),
			mockDeleteResourceEndpoint({
				schema: deleteResourceRequestBodySchema.refine((body) => body?.deleteHistory === true),
				successResponse: deletionResponse(),
				failureResponse: new HttpResponse(null, {status: 400}),
				delay: 1000,
			}),
		);
		const screen = await renderOperations();
		await submit(screen);
		await expect.element(screen.getByRole('button', {name: ACTION_NAME})).toBeDisabled();
		worker.use(mockDeletedDefinition());
		await screen.queryClient.invalidateQueries({queryKey: ['queryProcessDefinitions']});
		await expect.element(screen.getByText('Operation created', {exact: true})).toBeVisible();
		await expect
			.element(screen.getByRole('button', {name: 'Delete Process Definition History "Order Process - Version 2"'}))
			.toBeEnabled();
		expect(screen.router.state.location.href).toBe(INITIAL_ENTRY);
	});

	it.for([
		{status: 403, title: "You don't have permission to perform this operation"},
		{status: 500, title: "Couldn't create operation"},
	])('should recover after a $status deletion error', async ({status, title}, {worker}) => {
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
			}),
			mockCount(),
			mockDeleteResourceEndpoint({successResponse: new HttpResponse(null, {status})}),
		);
		const screen = await renderOperations();
		await submit(screen);
		await expect.element(screen.getByText(title, {exact: true})).toBeVisible();
		await expect.element(screen.getByRole('button', {name: ACTION_NAME})).toBeEnabled();
		expect(screen.router.state.location.href).toBe(INITIAL_ENTRY);
		worker.use(mockDeleteResourceEndpoint({successResponse: deletionResponse()}));
		await submit(screen);
		await expect.element(screen.getByText('Operation created', {exact: true})).toBeVisible();
	});

	it('should not trust a cached count after its refetch fails', async ({worker}) => {
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
			}),
			mockCount(),
		);
		const screen = await renderOperations();
		const countKey = ['processDefinitionRunningInstancesCount', DEFINITION.processDefinitionKey] as const;
		await expect.element(screen.getByRole('button', {name: ACTION_NAME})).toBeEnabled();
		worker.use(mockCount(0, 500));
		const canceledRefetch = screen.queryClient.refetchQueries({queryKey: countKey});
		await expect.poll(() => screen.queryClient.getQueryState(countKey)?.fetchStatus).toBe('fetching');
		await screen.queryClient.cancelQueries({queryKey: countKey});
		await canceledRefetch;
		await expect.element(screen.getByRole('button', {name: ACTION_NAME})).toBeEnabled();
		worker.use(mockQueryProcessInstancesEndpoint({successResponse: HttpResponse.error()}));
		await screen.queryClient.invalidateQueries({queryKey: countKey});
		await expect
			.element(screen.getByRole('button', {name: 'Could not check running instances. Retry before deleting.'}))
			.toBeDisabled();
		worker.use(mockCount());
		await userEvent.click(screen.getByRole('button', {name: 'Retry checking running instances'}));
		await expect.element(screen.getByRole('button', {name: ACTION_NAME})).toBeEnabled();
	});

	it('should reject confirmation if running instances appear before submission', async ({worker}) => {
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
			}),
			mockCount(),
		);
		const screen = await renderOperations();
		await userEvent.click(screen.getByRole('button', {name: ACTION_NAME}));
		await expect.element(screen.getByRole('heading', {name: 'Delete Process Definition'})).toBeVisible();
		worker.use(mockCount(1));
		await screen.queryClient.invalidateQueries({
			queryKey: ['processDefinitionRunningInstancesCount', DEFINITION.processDefinitionKey],
		});
		await expect
			.element(screen.getByRole('button', {name: 'Only process definitions without running instances can be deleted.'}))
			.toBeDisabled();
		await userEvent.click(screen.getByText(CONFIRMATION));
		await userEvent.click(screen.getByRole('button', {name: 'Delete', exact: true}));
		await expect
			.element(
				screen.getByText('The definition can no longer be deleted. Check its running instances and status again.'),
			)
			.toBeVisible();
		await expect.element(screen.getByRole('heading', {name: 'Delete Process Definition'})).not.toBeInTheDocument();
	});
});
