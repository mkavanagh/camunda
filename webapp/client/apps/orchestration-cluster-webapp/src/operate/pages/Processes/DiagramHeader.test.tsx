/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {describe, expect} from 'vitest';
import {render} from 'vitest-browser-react';
import {it} from '#/vitest-modules/test-extend';
import {renderWithRouter} from '#/vitest-modules/render-with-router';
import {HttpResponse} from 'msw';
import {queryProcessDefinitionsRequestBodySchema} from '@camunda/camunda-api-zod-schemas/8.11';
import {
	mockQueryProcessDefinitionsEndpoint,
	mockQueryProcessInstancesEndpoint,
} from '#/shared-test-modules/mock-handlers';
import {
	createProcessDefinition,
	createQueryProcessDefinitionsResponse,
} from '#/shared-test-modules/api-mocks/process-definitions';
import {createQueryProcessInstancesResponse} from '#/shared-test-modules/api-mocks/process-instances';
import {DiagramHeader} from './DiagramHeader';

describe('<DiagramHeader />', () => {
	it('shows a generic title when there is no matching definition', async () => {
		const screen = await render(<DiagramHeader processDefinitionSelection={{kind: 'no-match'}} />);

		await expect.element(screen.getByText('Process')).toBeVisible();
	});

	it('shows the process name, ID and deletion only for a single selected version', async ({worker}) => {
		const definition = createProcessDefinition({name: 'Order Process', processDefinitionKey: '123'});
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				schema: queryProcessDefinitionsRequestBodySchema.refine((body) => body.filter?.state === 'DRAINING'),
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
				failureResponse: HttpResponse.json(createQueryProcessDefinitionsResponse({items: [definition]})),
			}),
			mockQueryProcessInstancesEndpoint({successResponse: HttpResponse.json(createQueryProcessInstancesResponse())}),
		);
		const screen = await renderWithRouter(
			() => (
				<DiagramHeader
					processDefinitionSelection={{
						kind: 'single-version',
						definition,
					}}
				/>
			),
			{path: '/operate/processes', initialEntry: '/operate/processes'},
		);

		await expect.element(screen.getByRole('heading', {name: 'Order Process'})).toBeVisible();
		await expect.element(screen.getByTitle('my-process:1:0')).toBeVisible();
		await expect
			.element(screen.getByRole('button', {name: 'Delete Process Definition "Order Process - Version 1"'}))
			.toBeEnabled();
	});

	it('shows the version tag when present', async ({worker}) => {
		const definition = createProcessDefinition({versionTag: 'release-1'});
		worker.use(
			mockQueryProcessDefinitionsEndpoint({
				schema: queryProcessDefinitionsRequestBodySchema.refine((body) => body.filter?.state === 'DRAINING'),
				successResponse: HttpResponse.json(createQueryProcessDefinitionsResponse()),
				failureResponse: HttpResponse.json(createQueryProcessDefinitionsResponse({items: [definition]})),
			}),
			mockQueryProcessInstancesEndpoint({successResponse: HttpResponse.json(createQueryProcessInstancesResponse())}),
		);
		const screen = await renderWithRouter(
			() => (
				<DiagramHeader
					processDefinitionSelection={{
						kind: 'single-version',
						definition,
					}}
				/>
			),
			{path: '/operate/processes', initialEntry: '/operate/processes'},
		);

		await expect.element(screen.getByText('release-1')).toBeVisible();
	});

	it('does not show a version tag for an all-versions selection', async () => {
		const screen = await render(
			<DiagramHeader
				processDefinitionSelection={{
					kind: 'all-versions',
					definition: {name: 'Order Process', processDefinitionId: 'order-process'},
				}}
			/>,
		);

		await expect.element(screen.getByRole('heading', {name: 'Order Process'})).toBeVisible();
		await expect.element(screen.getByTitle('order-process')).toBeVisible();
		await expect.element(screen.getByTestId('delete-operation')).not.toBeInTheDocument();
	});
});
