/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {afterEach, beforeEach, describe, expect} from 'vitest';
import {userEvent} from 'vitest/browser';
import {HttpResponse} from 'msw';
import {it} from '#/vitest-modules/test-extend';
import {renderWithRouter} from '#/vitest-modules/render-with-router';
import {
	mockQueryProcessDefinitionsEndpoint,
	mockQueryProcessInstancesEndpoint,
} from '#/shared-test-modules/mock-handlers';
import {createQueryProcessDefinitionsResponse} from '#/shared-test-modules/api-mocks/process-definitions';
import {createQueryProcessInstancesResponse} from '#/shared-test-modules/api-mocks/process-instances';
import {createSystemConfiguration} from '#/shared-test-modules/api-mocks/system-configuration';
import {ProcessesHarness} from './ProcessesHarness';

const VARIABLE = [{name: 'status', operator: 'equals', value: '"open"'}];
const PROCESS_DEFINITIONS = HttpResponse.json(createQueryProcessDefinitionsResponse());
const PROCESS_INSTANCES = HttpResponse.json(createQueryProcessInstancesResponse());

function renderProcesses(search?: Record<string, string>) {
	return renderWithRouter(ProcessesHarness, {
		path: '/operate/processes',
		initialEntry: `/operate/processes${search ? `?${new URLSearchParams(search)}` : ''}`,
	});
}

describe('Processes variable filter', () => {
	beforeEach(() => {
		sessionStorage.setItem('clientConfig', JSON.stringify(createSystemConfiguration()));
	});
	afterEach(() => {
		sessionStorage.clear();
	});

	it('should debounce a complete inline equals filter and keep other filters through remove and reset', async ({
		worker,
	}) => {
		worker.use(
			mockQueryProcessInstancesEndpoint({successResponse: PROCESS_INSTANCES}),
			mockQueryProcessDefinitionsEndpoint({successResponse: PROCESS_DEFINITIONS}),
		);
		const screen = await renderProcesses({businessId: 'eq_order-123'});
		const search = () => screen.router.state.location.search as Record<string, unknown>;

		await userEvent.click(screen.getByRole('button', {name: 'More Filters'}));
		await userEvent.click(screen.getByTestId('optional-filter-menuitem-variable'));
		await userEvent.fill(screen.getByRole('textbox', {name: 'Name'}), 'status');
		await expect.poll(() => search().variable).toBeUndefined();
		await userEvent.fill(screen.getByRole('textbox', {name: 'Value'}), '"open"');
		await expect.poll(() => search().variable).toEqual(VARIABLE);
		await expect.poll(() => search().businessId).toBe('eq_order-123');

		await userEvent.hover(screen.getByRole('textbox', {name: 'Name'}));
		await userEvent.click(screen.getByRole('button', {name: 'Remove Variables Filter'}));
		await expect.poll(() => search().variable).toBeUndefined();
		await expect.poll(() => search().businessId).toBe('eq_order-123');

		await userEvent.click(screen.getByRole('button', {name: 'Reset filters'}));
		await expect.poll(() => search()).toEqual({});
	});

	it('should edit, validate, apply and remove modal conditions without changing the URL on Cancel', async ({
		worker,
	}) => {
		worker.use(
			mockQueryProcessInstancesEndpoint({successResponse: PROCESS_INSTANCES}),
			mockQueryProcessDefinitionsEndpoint({successResponse: PROCESS_DEFINITIONS}),
		);
		const screen = await renderProcesses({variable: JSON.stringify(VARIABLE)});
		const search = () => screen.router.state.location.search as Record<string, unknown>;

		await expect.element(screen.getByRole('textbox', {name: 'Name'})).toHaveValue('status');
		await userEvent.click(screen.getByRole('button', {name: 'Add condition'}));
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Add condition'}));
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Apply'}));
		await expect.element(screen.getByText('Variable name is required')).toBeVisible();
		await expect.poll(() => search().variable).toEqual(VARIABLE);

		await userEvent.fill(screen.getByRole('dialog').getByRole('textbox', {name: 'Name'}).last(), 'region');
		await userEvent.click(screen.getByRole('dialog').getByRole('combobox', {name: 'Operator'}).last());
		await userEvent.click(screen.getByRole('option', {name: 'exists'}));
		await expect.element(screen.getByText('Variable name is required')).not.toBeInTheDocument();
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Apply'}));
		await expect.poll(() => search().variable).toEqual([...VARIABLE, {name: 'region', operator: 'exists', value: ''}]);
		await expect.element(screen.getByRole('list', {name: 'Active variable filters'})).toBeVisible();

		await userEvent.click(screen.getByRole('button', {name: 'Edit conditions'}));
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Remove condition'}).last());
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Cancel'}));
		await expect.poll(() => search().variable).toHaveLength(2);
		await userEvent.click(screen.getByRole('button', {name: 'Edit conditions'}));
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Remove condition'}).last());
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Apply'}));
		await expect.poll(() => search().variable).toEqual(VARIABLE);
	});

	it('should keep a saved condition when an incomplete inline edit or canceled modal is discarded', async ({
		worker,
	}) => {
		worker.use(
			mockQueryProcessInstancesEndpoint({successResponse: PROCESS_INSTANCES}),
			mockQueryProcessDefinitionsEndpoint({successResponse: PROCESS_DEFINITIONS}),
		);
		const screen = await renderProcesses({variable: JSON.stringify(VARIABLE)});
		const search = () => screen.router.state.location.search as Record<string, unknown>;

		await userEvent.clear(screen.getByRole('textbox', {name: 'Value'}));
		await expect.element(screen.getByText('Value has to be filled')).toBeVisible();
		await expect.poll(() => search().variable).toEqual(VARIABLE);
		await userEvent.click(screen.getByRole('button', {name: 'Add condition'}));
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Cancel'}));
		await expect.poll(() => search().variable).toEqual(VARIABLE);
	});

	it('should commit a valid inline condition before opening the modal, including when canceled', async ({worker}) => {
		worker.use(
			mockQueryProcessInstancesEndpoint({successResponse: PROCESS_INSTANCES}),
			mockQueryProcessDefinitionsEndpoint({successResponse: PROCESS_DEFINITIONS}),
		);
		const screen = await renderProcesses();
		const search = () => screen.router.state.location.search as Record<string, unknown>;

		await userEvent.click(screen.getByRole('button', {name: 'More Filters'}));
		await userEvent.click(screen.getByTestId('optional-filter-menuitem-variable'));
		await userEvent.fill(screen.getByRole('textbox', {name: 'Name'}), 'status');
		await userEvent.fill(screen.getByRole('textbox', {name: 'Value'}), '"open"');
		await userEvent.click(screen.getByRole('button', {name: 'Add condition'}));
		await expect.poll(() => search().variable).toEqual(VARIABLE);
		await userEvent.click(screen.getByRole('dialog').getByRole('button', {name: 'Cancel'}));
		await expect.poll(() => search().variable).toEqual(VARIABLE);
	});

	it('should carry an incomplete inline draft into the modal without submitting invalid criteria', async ({worker}) => {
		worker.use(
			mockQueryProcessInstancesEndpoint({successResponse: PROCESS_INSTANCES}),
			mockQueryProcessDefinitionsEndpoint({successResponse: PROCESS_DEFINITIONS}),
		);
		const screen = await renderProcesses();
		await userEvent.click(screen.getByRole('button', {name: 'More Filters'}));
		await userEvent.click(screen.getByTestId('optional-filter-menuitem-variable'));
		await userEvent.fill(screen.getByRole('textbox', {name: 'Name'}), 'status');
		await userEvent.click(screen.getByRole('button', {name: 'Add condition'}));
		await expect.element(screen.getByRole('dialog').getByRole('textbox', {name: 'Name'})).toHaveValue('status');
		await expect.poll(() => (screen.router.state.location.search as Record<string, unknown>).variable).toBeUndefined();
	});
});
