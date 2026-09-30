/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {assign, fromPromise, setup} from 'xstate';
import type {QueryClient} from '@tanstack/react-query';
import {t} from 'i18next';
import {
	endpoints as unifiedAPIEndpoints,
	createModificationBatchOperationResponseBodySchema,
	type BatchOperation,
	type CreateCancellationBatchOperationRequestBody,
	type CreateCancellationBatchOperationResponseBody,
	type CreateDeletionBatchOperationResponseBody,
	type CreateModificationBatchOperationRequestBody,
	type CreateModificationBatchOperationResponseBody,
	type CreateIncidentResolutionBatchOperationResponseBody,
	type SuspendProcessInstancesBatchOperationResponseBody,
	type ResumeProcessInstancesBatchOperationResponseBody,
} from '@camunda/camunda-api-zod-schemas/8.11';
import {endpoints} from '#/shared/http/endpoints';
import {request, requestErrorSchema} from '#/shared/http/request';
import {notificationsStore} from '#/shared/notifications/notifications.store';
import {formatOperationType} from '#/operate/shared/utils/formatOperationType';
import {getBootConfig} from '#/shared/config/getBootConfig';
import {mergePathname} from '#/shared/http/mergePathname';
import type {ProcessBulkAction} from './useProcessInstancesSelection';

type Submission = {
	type: 'submit';
	filterIdentity: string;
} & (
	| {action: ProcessBulkAction; body: CreateCancellationBatchOperationRequestBody}
	| {action: 'modify'; body: CreateModificationBatchOperationRequestBody}
);
type SubmissionResponse =
	| CreateCancellationBatchOperationResponseBody
	| CreateDeletionBatchOperationResponseBody
	| CreateIncidentResolutionBatchOperationResponseBody
	| SuspendProcessInstancesBatchOperationResponseBody
	| ResumeProcessInstancesBatchOperationResponseBody
	| CreateModificationBatchOperationResponseBody;
type TrackingInput = {queryClient: QueryClient; batchOperationKey: string};
const REQUESTS = {
	delete: endpoints.createDeletionBatchOperation,
	cancel: endpoints.createCancellationBatchOperation,
	retry: endpoints.createIncidentResolutionBatchOperation,
	suspend: endpoints.createSuspensionBatchOperation,
	resume: endpoints.createResumptionBatchOperation,
};

function refresh(queryClient: QueryClient) {
	for (const queryKey of [['processInstances'], ['batchOperations'], ['batchOperationItems']]) {
		void queryClient.invalidateQueries({queryKey});
	}
}

function notifyDetails(batchOperationKey: string, title: string, kind: 'success' | 'warning') {
	notificationsStore.displayNotification({
		kind,
		title,
		subtitle: t('operate.processes.toolbar.progressSubtitle'),
		isDismissable: true,
		isActionable: true,
		actionButtonLabel: t('operate.processes.toolbar.details'),
		onActionButtonClick: () => window.location.assign(`/operate/batch-operations/${batchOperationKey}`),
	});
}

const trackingMachine = setup({
	types: {
		input: {} as TrackingInput,
		context: {} as TrackingInput & {failures: number},
	},
	actors: {
		fetch: fromPromise(async ({input}: {input: TrackingInput}) =>
			input.queryClient.fetchQuery({
				queryKey: ['batchOperations', input.batchOperationKey],
				staleTime: 0,
				retry: false,
				queryFn: async (): Promise<BatchOperation> => {
					const {response, error} = await request(
						endpoints.getBatchOperation({batchOperationKey: input.batchOperationKey}),
					);
					if (error !== null) {
						throw error;
					}
					return response.json();
				},
			}),
		),
	},
}).createMachine({
	context: ({input}) => ({...input, failures: 0}),
	initial: 'fetching',
	states: {
		fetching: {
			invoke: {
				src: 'fetch',
				input: ({context}) => context,
				onDone: [
					{
						guard: ({event}) => !['CREATED', 'ACTIVE', 'SUSPENDED'].includes(event.output.state),
						target: 'done',
						actions: ({context}) => refresh(context.queryClient),
					},
					{target: 'waiting', actions: assign({failures: 0})},
				],
				onError: [
					{
						guard: ({context}) => context.failures >= 2,
						target: 'done',
						actions: ({context}) => {
							refresh(context.queryClient);
							notifyDetails(context.batchOperationKey, t('operate.processes.toolbar.progressUnavailable'), 'warning');
						},
					},
					{target: 'waiting', actions: assign({failures: ({context}) => context.failures + 1})},
				],
			},
		},
		waiting: {after: {5000: 'fetching'}},
		done: {type: 'final'},
	},
});

const processBulkOperationMachine = setup({
	types: {
		input: {} as {queryClient: QueryClient},
		context: {} as {
			queryClient: QueryClient;
			acceptedIdentity: string | null;
			acceptedKey: string | null;
			acceptedAction: Submission['action'] | null;
		},
		events: {} as Submission,
	},
	actors: {
		track: trackingMachine,
		submit: fromPromise(async ({input}: {input: Submission}) => {
			const inputRequest =
				input.action === 'modify'
					? new Request(
							new URL(
								mergePathname(
									getBootConfig().contextPath,
									unifiedAPIEndpoints.createModificationBatchOperation.getUrl(),
								),
								window.location.origin,
							),
							{
								method: unifiedAPIEndpoints.createModificationBatchOperation.method,
								credentials: 'include',
								mode: 'cors',
								body: JSON.stringify(input.body),
								headers: {'Content-Type': 'application/json'},
							},
						)
					: REQUESTS[input.action](input.body);
			const {response, error} = await request(inputRequest);
			if (error !== null) {
				throw error;
			}
			const result: SubmissionResponse =
				input.action === 'modify'
					? createModificationBatchOperationResponseBodySchema.parse(await response.json())
					: await response.json();
			return {...result, filterIdentity: input.filterIdentity, action: input.action};
		}),
	},
}).createMachine({
	context: ({input}) => ({...input, acceptedIdentity: null, acceptedKey: null, acceptedAction: null}),
	initial: 'idle',
	states: {
		idle: {on: {submit: 'submitting'}},
		submitting: {
			invoke: {
				src: 'submit',
				input: ({event}) => event,
				onDone: {
					target: 'idle',
					actions: assign(({context, event, spawn}) => {
						const {batchOperationKey, batchOperationType, filterIdentity} = event.output;
						spawn('track', {input: {queryClient: context.queryClient, batchOperationKey}});
						refresh(context.queryClient);
						notifyDetails(
							batchOperationKey,
							t('operate.processes.toolbar.started', {
								operationType: formatOperationType(batchOperationType),
							}),
							'success',
						);
						return {
							acceptedIdentity: filterIdentity,
							acceptedKey: batchOperationKey,
							acceptedAction: event.output.action,
						};
					}),
				},
				onError: {
					target: 'idle',
					actions: ({event}) => {
						const error = requestErrorSchema.safeParse(event.error);
						const forbidden = error.success && error.data.response?.status === 403;
						notificationsStore.displayNotification({
							kind: forbidden ? 'warning' : 'error',
							title: forbidden ? t('operate.processes.toolbar.forbidden') : t('operate.processes.toolbar.failed'),
							subtitle: forbidden ? t('operate.processes.toolbar.contactAdministrator') : undefined,
							isDismissable: true,
						});
					},
				},
			},
		},
	},
});

export {processBulkOperationMachine};
