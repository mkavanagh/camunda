/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {afterEach, beforeEach, describe, expect} from 'vitest';
import {userEvent} from 'vitest/browser';
import {HttpResponse, http} from 'msw';
import type {SetupWorker} from 'msw/browser';
import {it} from '#/vitest-modules/test-extend';
import {renderWithRouter} from '#/vitest-modules/render-with-router';
import {cleanup} from 'vitest-browser-react';
import {
	mockGetBatchOperationEndpoint,
	mockCurrentUserEndpoint,
	mockGetProcessDefinitionStatisticsEndpoint,
	mockGetProcessDefinitionXmlEndpoint,
	mockQueryBatchOperationItemsEndpoint,
	mockQueryProcessDefinitionsEndpoint,
	mockQueryProcessInstancesEndpoint,
} from '#/shared-test-modules/mock-handlers';
import {
	createProcessDefinition,
	createQueryProcessDefinitionsResponse,
} from '#/shared-test-modules/api-mocks/process-definitions';
import {
	createGetProcessDefinitionStatisticsResponse,
	createProcessDefinitionStatistic,
} from '#/shared-test-modules/api-mocks/process-definition-statistics';
import {BPMN_XML} from '#/shared-test-modules/api-mocks/process-definition-xmls';
import {
	createProcessInstance,
	createQueryProcessInstancesResponse,
} from '#/shared-test-modules/api-mocks/process-instances';
import {
	createBatchOperation,
	createQueryBatchOperationItemsResponse,
} from '#/shared-test-modules/api-mocks/batch-operations';
import {createSystemConfiguration} from '#/shared-test-modules/api-mocks/system-configuration';
import {createCurrentUser} from '#/shared-test-modules/api-mocks/current-user';
import {Notifications} from '#/shared/notifications/components/Notifications';
import {notificationsStore} from '#/shared/notifications/notifications.store';
import {ProcessesHarness} from './ProcessesHarness';

const DEFINITION = createProcessDefinition({
	processDefinitionId: 'my_simple_process',
	processDefinitionKey: '123',
	version: 1,
	name: 'Invoice process',
});
const PAGE_URL = '/operate/processes?process=my_simple_process&version=1&elementId=task-1&tenantId=tenant-a';

function renderPage(sourceElementId = 'task-1', businessId?: string, tenantId = 'tenant-a') {
	const initialEntry = `${PAGE_URL.replace('elementId=task-1', `elementId=${sourceElementId}`).replace('tenantId=tenant-a', `tenantId=${tenantId}`)}${businessId ? `&businessId=${businessId}` : ''}`;
	const Page = () => (
		<>
			<ProcessesHarness />
			<Notifications />
		</>
	);
	return renderWithRouter(Page, {path: '/operate/processes', initialEntry});
}

function setUpPage(worker: SetupWorker) {
	const instance = (key: string, state: 'ACTIVE' | 'COMPLETED') =>
		createProcessInstance({processInstanceKey: key, state, processDefinitionId: 'my_simple_process'});
	worker.use(
		mockQueryProcessDefinitionsEndpoint({
			successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse({items: [DEFINITION]})),
		}),
		mockQueryProcessInstancesEndpoint({
			successResponse: HttpResponse.json(
				createQueryProcessInstancesResponse({
					items: [instance('1', 'ACTIVE'), instance('2', 'ACTIVE'), instance('3', 'COMPLETED')],
					page: {totalItems: 3},
				}),
			),
		}),
		mockQueryBatchOperationItemsEndpoint({
			successResponse: HttpResponse.json(createQueryBatchOperationItemsResponse()),
		}),
		mockGetProcessDefinitionXmlEndpoint({successResponse: HttpResponse.text(BPMN_XML)}),
		mockGetProcessDefinitionStatisticsEndpoint({
			successResponse: HttpResponse.json(
				createGetProcessDefinitionStatisticsResponse([
					createProcessDefinitionStatistic({elementId: 'task-1', active: 2}),
				]),
			),
		}),
	);
}

async function enterMode(screen: Awaited<ReturnType<typeof renderPage>>) {
	await userEvent.click(screen.getByRole('checkbox', {name: 'Select instance 1'}), {force: true});
	await expect.element(screen.getByRole('button', {name: 'Move'})).toBeEnabled();
	await userEvent.click(screen.getByRole('button', {name: 'Move'}));
	await expect.element(screen.getByRole('dialog')).toMatchTextContent('Process instance batch move mode');
	await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Continue'}), {force: true});
	await expect.element(screen.getByText('Batch Modification Mode')).toBeVisible();
}

async function selectTarget(screen: Awaited<ReturnType<typeof renderPage>>) {
	await expect.poll(() => document.querySelector<SVGElement>('[data-element-id="end_event"]')).not.toBeNull();
	const target = document.querySelector<SVGElement>('[data-element-id="end_event"]');
	if (target === null) {
		throw new Error('Target element was not rendered by bpmn-js');
	}
	await userEvent.click(target);
	await expect.element(screen.getByRole('button', {name: 'Review Modification'})).toBeEnabled();
}

describe('Processes batch modification', () => {
	beforeEach(() => {
		sessionStorage.setItem('clientConfig', JSON.stringify(createSystemConfiguration()));
	});
	afterEach(async () => {
		await cleanup();
		sessionStorage.clear();
		localStorage.removeItem('hideMoveModificationHelperModal');
		notificationsStore.reset();
	});

	it.for([
		['task-1', '3', 'You can only move element instances in active or incident state.'],
		['start_event', '1', 'The selected element type is not supported.'],
		['missing_element', '1', 'Select an element from the diagram first.'],
	] as const)('should explain disabled Move for %s', async ([sourceElementId, instanceKey, reason], {worker}) => {
		setUpPage(worker);
		const screen = await renderPage(sourceElementId);
		await userEvent.click(screen.getByRole('checkbox', {name: `Select instance ${instanceKey}`}), {force: true});
		await expect.element(screen.getByRole('button', {name: 'Move'})).toBeDisabled();
		await expect.element(screen.getByRole('button', {name: 'Move'})).toHaveAttribute('title', reason);
	});

	it('should disable Move when the same process and version exist in multiple tenants', async ({worker}) => {
		sessionStorage.setItem(
			'clientConfig',
			JSON.stringify(
				createSystemConfiguration({
					deployment: {isMultiTenancyEnabled: true, isTenantsApiEnabled: true, maxRequestSize: 0},
				}),
			),
		);
		setUpPage(worker);
		worker.use(
			mockCurrentUserEndpoint({successResponse: HttpResponse.json(createCurrentUser())}),
			mockQueryProcessDefinitionsEndpoint({
				successResponse: HttpResponse.json(
					createQueryProcessDefinitionsResponse({
						items: [
							DEFINITION,
							createProcessDefinition({processDefinitionId: 'my_simple_process', version: 1, tenantId: 'tenant-b'}),
						],
					}),
				),
			}),
		);
		const screen = await renderPage('task-1', undefined, 'all');
		await userEvent.click(screen.getByRole('checkbox', {name: 'Select instance 1'}), {force: true});
		await expect.element(screen.getByRole('button', {name: 'Move'})).toBeDisabled();
		await expect
			.element(screen.getByRole('button', {name: 'Move'}))
			.toHaveAttribute('title', 'Select a single tenant to move instances of this process.');
	});

	it('should enter the framed mode, allow undo, and discard without changing URL filters', async ({worker}) => {
		setUpPage(worker);
		const screen = await renderPage();

		await enterMode(screen);
		await expect.element(screen.getByRole('button', {name: 'Review Modification'})).toBeDisabled();
		await selectTarget(screen);
		await expect.element(screen.getByText(/Modification scheduled:/)).toBeVisible();
		await expect.element(screen.getByText('+2')).toBeInTheDocument();
		await expect.element(screen.getByText('-2')).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', {name: 'Undo'}));
		await expect.element(screen.getByRole('button', {name: 'Review Modification'})).toBeDisabled();
		await selectTarget(screen);
		await userEvent.click(screen.getByTestId('frame-container').getByRole('button', {name: 'Exit'}));
		await expect.element(screen.getByRole('dialog')).toMatchTextContent('About to discard all added modifications.');
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Cancel'}));
		await expect.element(screen.getByText('Batch Modification Mode')).toBeVisible();
		await userEvent.click(screen.getByTestId('frame-container').getByRole('button', {name: 'Exit'}));
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Exit'}));

		await expect.element(screen.getByText('Batch Modification Mode')).not.toBeInTheDocument();
		expect(screen.router.state.location.search).toMatchObject({
			process: 'my_simple_process',
			version: 1,
			elementId: 'task-1',
			tenantId: 'tenant-a',
		});
		await expect.element(screen.getByRole('button', {name: 'Move'})).not.toBeInTheDocument();
	});

	it('should respect the remembered helper choice on re-entry', async ({worker}) => {
		setUpPage(worker);
		const screen = await renderPage();
		await userEvent.click(screen.getByRole('checkbox', {name: 'Select instance 1'}), {force: true});
		await userEvent.click(screen.getByRole('button', {name: 'Move'}));
		await userEvent.click(screen.getByText("Don't show this message next time"));
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Continue'}));
		await expect.element(screen.getByText('Batch Modification Mode')).toBeVisible();
		await userEvent.click(screen.getByTestId('frame-container').getByRole('button', {name: 'Exit'}));
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Exit'}));
		await userEvent.click(screen.getByRole('checkbox', {name: 'Select instance 1'}), {force: true});
		await userEvent.click(screen.getByRole('button', {name: 'Move'}));

		await expect.element(screen.getByText('Batch Modification Mode')).toBeVisible();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('should block navigation away until discard is confirmed', async ({worker}) => {
		setUpPage(worker);
		const screen = await renderPage();
		await enterMode(screen);
		await selectTarget(screen);

		await userEvent.click(screen.getByRole('link', {name: 'View instance 1'}), {force: true});
		await expect.element(screen.getByRole('dialog')).toMatchTextContent('About to discard all added modifications.');
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Cancel'}));
		expect(screen.router.state.location.pathname).toBe('/operate/processes');
		await expect.element(screen.getByText('Batch Modification Mode')).toBeVisible();
	});

	it('should allow selecting the move target using a keyboard-accessible dropdown', async ({worker}) => {
		setUpPage(worker);
		const screen = await renderPage();
		await enterMode(screen);

		await userEvent.click(screen.getByRole('combobox', {name: 'Move target'}));
		await userEvent.keyboard('{ArrowDown}{Enter}');

		await expect.element(screen.getByRole('button', {name: 'Review Modification'})).toBeEnabled();
	});

	it('should hide cached diagram targets after a refetch failure and recover on retry', async ({worker}) => {
		setUpPage(worker);
		const screen = await renderPage();
		await enterMode(screen);
		let isFailing = true;
		worker.use(
			http.get('*/v2/process-definitions/:processDefinitionKey/xml', () =>
				isFailing ? new HttpResponse(null, {status: 503}) : HttpResponse.text(BPMN_XML),
			),
		);
		const xmlQuery = screen.queryClient.getQueryCache().find({queryKey: ['processDefinitionDiagram', '123']});
		if (xmlQuery === undefined) {
			throw new Error('The diagram query was not registered');
		}
		await expect(xmlQuery.fetch()).rejects.toBeDefined();
		await expect.element(screen.getByRole('button', {name: 'Retry diagram'})).toBeVisible();
		await expect.element(screen.getByRole('button', {name: 'Review Modification'})).toBeDisabled();
		isFailing = false;
		await userEvent.click(screen.getByRole('button', {name: 'Retry diagram'}));
		await expect.element(screen.getByRole('button', {name: 'Retry diagram'})).not.toBeInTheDocument();
		await selectTarget(screen);
	});

	it.for(['include', 'exclude'] as const)(
		'should submit the %s scope, retain filters, and reset mode only after acceptance',
		async (scope, {worker}) => {
			setUpPage(worker);
			let submitted: unknown;
			let release: () => void = () => {};
			const pending = new Promise<void>((resolve) => {
				release = resolve;
			});
			worker.use(
				http.post('*/v2/process-instances/modification', async ({request}) => {
					submitted = await request.json();
					if (scope === 'exclude') {
						await pending;
					}
					return HttpResponse.json(
						{batchOperationKey: 'batch-modification-1', batchOperationType: 'MODIFY_PROCESS_INSTANCE'},
						{status: 202},
					);
				}),
				mockGetBatchOperationEndpoint({
					successResponse: HttpResponse.json(
						createBatchOperation({
							batchOperationKey: 'batch-modification-1',
							batchOperationType: 'MODIFY_PROCESS_INSTANCE',
						}),
					),
				}),
			);
			const screen = await renderPage('task-1', scope === 'exclude' ? 'eq_invoice-123' : undefined);

			if (scope === 'exclude') {
				await userEvent.click(screen.getByRole('checkbox', {name: 'Select all items'}), {force: true});
				await userEvent.click(screen.getByRole('checkbox', {name: 'Select instance 3'}), {force: true});
				await userEvent.click(screen.getByRole('checkbox', {name: 'Select instance 2'}), {force: true});
				await userEvent.click(screen.getByRole('button', {name: 'Move'}));
				await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Continue'}), {force: true});
			} else {
				await enterMode(screen);
			}
			await selectTarget(screen);
			await userEvent.click(screen.getByRole('button', {name: 'Review Modification'}));
			const review = screen.getByRole('dialog');
			await expect.element(review.getByText('Invoice process', {exact: false})).toBeVisible();
			await expect.element(review.getByRole('cell', {name: 'Review invoice --> end_event'})).toBeVisible();
			if (scope === 'exclude') {
				await expect.element(review.getByText(/affected element count is unavailable/)).toBeVisible();
			}
			await userEvent.click(review.getByRole('button', {name: 'Apply'}));
			if (scope === 'exclude') {
				await screen.router.navigate({to: '.', search: (prev) => ({...prev, businessId: 'eq_changed'})});
				release();
			}

			await expect
				.poll(() => submitted)
				.toMatchObject({
					moveInstructions: [{sourceElementId: 'task-1', targetElementId: 'end_event'}],
					filter: {
						processDefinitionId: {$eq: 'my_simple_process'},
						tenantId: {$eq: 'tenant-a'},
						processInstanceKey: scope === 'include' ? {$in: ['1']} : {$notIn: ['3', '2']},
						...(scope === 'exclude' ? {businessId: {$eq: 'invoice-123'}} : {}),
					},
				});
			await expect.element(screen.getByText('Batch Modification Mode')).not.toBeInTheDocument();
			await expect
				.element(screen.getByText('The batch operation "Modify Process Instance" has been started'))
				.toBeVisible();
			expect(screen.router.state.location.search).toMatchObject({tenantId: 'tenant-a', elementId: 'task-1'});
			await expect
				.poll(() => screen.queryClient.getQueryData(['batchOperations', 'batch-modification-1']))
				.toBeDefined();
			await expect.poll(() => screen.queryClient.isFetching()).toBe(0);
			await cleanup();
		},
	);

	it.for([
		{
			kind: 'permission',
			response: new HttpResponse(null, {status: 403}),
			title: "You don't have permission to perform this operation",
		},
		{kind: 'malformed acceptance', response: HttpResponse.json({}, {status: 202}), title: "Couldn't create operation"},
	])('should retain the review after $kind failure', async ({response, title}, {worker}) => {
		setUpPage(worker);
		worker.use(http.post('*/v2/process-instances/modification', () => response));
		const screen = await renderPage();

		await enterMode(screen);
		await selectTarget(screen);
		await userEvent.click(screen.getByRole('button', {name: 'Review Modification'}));
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Apply'}));

		await expect.element(screen.getByText(title)).toBeVisible();
		await expect.element(screen.getByRole('dialog').getByRole('button', {name: 'Apply'})).toBeEnabled();
	});
});
