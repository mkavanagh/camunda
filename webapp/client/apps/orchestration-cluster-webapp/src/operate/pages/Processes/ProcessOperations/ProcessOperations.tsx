/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useRouter} from '@tanstack/react-router';
import {Button, InlineLoading, Link, ListItem, Stack, Tag, Tooltip} from '@carbon/react';
import type {
	DeleteResourceResponseBody,
	ProcessDefinition,
	QueryProcessInstancesResponseBody,
} from '@camunda/camunda-api-zod-schemas/8.11';
import {DrainingTag} from '#/operate/components/DrainingTag/DrainingTag';
import {DangerButton} from '#/operate/shared/OperationItem/DangerButton';
import {OperationItems} from '#/operate/shared/OperationItems/OperationItems';
import {DeleteButtonContainer} from '#/operate/shared/DeleteDefinition/styled';
import {DeleteDefinitionModal} from '#/operate/shared/DeleteDefinitionModal/DeleteDefinitionModal';
import {UnorderedList} from '#/operate/shared/DeleteDefinitionModal/styled';
import {StructuredList} from '#/operate/shared/StructuredList/StructuredList';
import {handleOperationError} from '#/operate/shared/utils/handleOperationError';
import {isSpecificTenant} from '#/operate/shared/utils/isSpecificTenant';
import {drainingProcessDefinitionsQuery} from '#/operate/pages/Dashboard/InstancesByProcess/instancesByProcess.queries';
import {getBatchOperationOptions} from '#/operate/pages/BatchOperation/batchOperation.queries';
import {request, type RequestError} from '#/shared/http/request';
import {endpoints} from '#/shared/http/endpoints';
import {queries} from '#/shared/http/queries';
import {mapQueryError} from '#/shared/http/mapQueryError';
import {notificationsStore} from '#/shared/notifications/notifications.store';
import {getProcessDefinitionName} from '../getProcessDefinitionName';

type Props = {
	definition: ProcessDefinition;
};

type DeletionVariant = 'definition' | 'history';
type AcceptedDeletion = {variant: DeletionVariant; batchOperationKey: string | null};

const RUNNING_INSTANCES_REFETCH_INTERVAL_MS = 5000;
const ACCEPTED_OPERATION_REFETCH_INTERVAL_MS = 5000;

function acceptedDeletionKey(definition: ProcessDefinition, variant: DeletionVariant) {
	return `operate:definitionDeletion:${encodeURIComponent(definition.tenantId)}:${encodeURIComponent(definition.processDefinitionId)}:${definition.version}:${variant}`;
}

const ProcessOperations: React.FC<Props> = ({definition}) => {
	const {t} = useTranslation();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
	const [acceptedDeletion, setAcceptedDeletion] = useState<AcceptedDeletion | null>(() => {
		try {
			const stored = sessionStorage.getItem(acceptedDeletionKey(definition, 'history'));
			return stored === null ? null : {variant: 'history', batchOperationKey: stored || null};
		} catch {
			notificationsStore.displayNotification({
				kind: 'error',
				title: t('operate.processes.definitionDeletion.storageError'),
				isDismissable: true,
			});
			return {variant: 'history', batchOperationKey: null};
		}
	});
	const name = getProcessDefinitionName(definition);
	const tenantId = router.state.location.search.tenantId;
	const specificTenantId = isSpecificTenant(tenantId) ? tenantId : undefined;
	const {
		data: matchingDefinitions,
		isPending: isIdentityPending,
		isError: isIdentityError,
		refetch: refetchIdentity,
	} = useQuery({
		...queries.queryProcessDefinitions({
			filter: {
				processDefinitionId: {$eq: definition.processDefinitionId},
				version: definition.version,
				...(specificTenantId ? {tenantId: specificTenantId} : {}),
			},
			page: {limit: 2},
		}),
		staleTime: 5000,
		refetchInterval: 5000,
		refetchOnWindowFocus: true,
		retry: false,
	});
	const currentDefinition =
		matchingDefinitions?.items[0]?.processDefinitionKey === definition.processDefinitionKey
			? matchingDefinitions.items[0]
			: definition;
	const isDeleted = definition.state === 'DELETED' || currentDefinition.state === 'DELETED';
	const isDefinitionDeletionAvailable =
		!isIdentityError &&
		matchingDefinitions?.items.length === 1 &&
		!matchingDefinitions.page.hasMoreTotalItems &&
		matchingDefinitions.items[0]?.processDefinitionKey === definition.processDefinitionKey &&
		(specificTenantId === undefined || matchingDefinitions.items[0]?.tenantId === specificTenantId);
	const {
		data: draining,
		isPending: isDrainingPending,
		isError: isDrainingError,
		refetch: refetchDraining,
	} = useQuery({...drainingProcessDefinitionsQuery(), enabled: isDefinitionDeletionAvailable});
	const isDraining =
		!isDeleted && (currentDefinition.state === 'DRAINING' || !!draining?.byKey.has(definition.processDefinitionKey));
	const {
		data: acceptedBatch,
		isError: isOperationStatusError,
		refetch: refetchAcceptedBatch,
	} = useQuery({
		...getBatchOperationOptions(acceptedDeletion?.batchOperationKey ?? ''),
		enabled: acceptedDeletion?.batchOperationKey !== undefined && acceptedDeletion.batchOperationKey !== null,
		retry: false,
		refetchInterval: (query) => {
			const state = query.state.data?.state;
			return state === 'FAILED' || state === 'CANCELED' || state === 'PARTIALLY_COMPLETED' || state === 'COMPLETED'
				? false
				: ACCEPTED_OPERATION_REFETCH_INTERVAL_MS;
		},
	});
	const hasAcceptedBatchFailed =
		acceptedBatch?.state === 'FAILED' ||
		acceptedBatch?.state === 'CANCELED' ||
		acceptedBatch?.state === 'PARTIALLY_COMPLETED';
	const isAcceptedVariantCurrent = acceptedDeletion !== null && isDeleted;
	const isAcceptedDeletionPending = isAcceptedVariantCurrent && !hasAcceptedBatchFailed;
	const hasDefinitionDisappeared = !isIdentityPending && !isIdentityError && matchingDefinitions?.items.length === 0;
	useEffect(() => {
		if (acceptedDeletion !== null && (hasAcceptedBatchFailed || hasDefinitionDisappeared)) {
			try {
				sessionStorage.removeItem(acceptedDeletionKey(definition, 'history'));
			} catch {
				notificationsStore.displayNotification({
					kind: 'error',
					title: t('operate.processes.definitionDeletion.storageError'),
					isDismissable: true,
				});
			}
		}
	}, [acceptedDeletion, definition, hasAcceptedBatchFailed, hasDefinitionDisappeared, t]);
	const {
		data: runningInstancesCount,
		isPending: isCountPending,
		isError: isCountError,
		refetch: refetchRunningInstancesCount,
	} = useQuery({
		queryKey: ['processDefinitionRunningInstancesCount', definition.processDefinitionKey] as const,
		enabled: isDefinitionDeletionAvailable,
		queryFn: async ({signal}) => {
			const {response, error} = await request(
				new Request(
					endpoints.queryProcessInstances({
						filter: {
							processDefinitionKey: {$eq: definition.processDefinitionKey},
							$or: [{state: {$in: ['ACTIVE', 'SUSPENDED']}}, {hasIncident: true}],
						},
						page: {from: 0, limit: 0},
					}),
					{signal},
				),
			);
			if (error !== null) {
				throw mapQueryError(error);
			}
			const result: QueryProcessInstancesResponseBody = await response.json();
			return result.page.totalItems;
		},
		retry: false,
		refetchInterval: RUNNING_INSTANCES_REFETCH_INTERVAL_MS,
		refetchOnWindowFocus: true,
	});

	const {mutate: deleteDefinition, isPending: isOperationRunning} = useMutation<
		DeleteResourceResponseBody,
		RequestError,
		DeletionVariant
	>({
		mutationFn: async () => {
			const {response, error} = await request(
				endpoints.deleteResource(definition.processDefinitionKey, {deleteHistory: true}),
			);
			if (error !== null) {
				throw error;
			}
			return response.json();
		},
		onSuccess: ({batchOperation}, variant) => {
			if (variant === 'history' && batchOperation !== null) {
				setAcceptedDeletion({variant, batchOperationKey: batchOperation.batchOperationKey});
				try {
					sessionStorage.setItem(acceptedDeletionKey(definition, variant), batchOperation.batchOperationKey);
				} catch {
					notificationsStore.displayNotification({
						kind: 'error',
						title: t('operate.processes.definitionDeletion.storageError'),
						isDismissable: true,
					});
				}
			}
			notificationsStore.displayNotification({
				kind: 'success',
				title: t('operate.processes.definitionDeletion.successTitle'),
				isDismissable: true,
			});
			void Promise.all([
				queryClient.invalidateQueries({queryKey: ['queryProcessDefinitions']}),
				queryClient.invalidateQueries({queryKey: ['queryProcessDefinitionsInfinite']}),
				queryClient.invalidateQueries({queryKey: ['processDefinition']}),
				queryClient.invalidateQueries({queryKey: ['drainingProcessDefinitions']}),
				queryClient.invalidateQueries({queryKey: ['instancesByProcess']}),
				queryClient.invalidateQueries({queryKey: ['instancesByProcessVersions']}),
				queryClient.invalidateQueries({queryKey: ['processInstances']}),
				queryClient.invalidateQueries({
					queryKey: ['processDefinitionRunningInstancesCount', definition.processDefinitionKey],
				}),
			]);
		},
		onError: (error) => handleOperationError(error.response?.status),
	});

	const buttonTitle = !isDefinitionDeletionAvailable
		? t(
				isIdentityError
					? 'operate.processes.definitionDeletion.identityError'
					: 'operate.processes.definitionDeletion.ambiguousSelection',
			)
		: isOperationStatusError && isAcceptedVariantCurrent
			? t('operate.processes.definitionDeletion.operationStatusError')
			: hasAcceptedBatchFailed && isAcceptedVariantCurrent
				? t('operate.processes.definitionDeletion.batchFailed')
				: isDrainingError
					? t('operate.processes.definitionDeletion.statusError')
					: isCountError
						? t('operate.processes.definitionDeletion.countError')
						: (runningInstancesCount ?? 0) > 0
							? t('operate.processes.definitionDeletion.runningInstances')
							: t(
									isDeleted
										? 'operate.processes.definitionDeletion.historyButtonTitle'
										: 'operate.processes.definitionDeletion.buttonTitle',
									{name, version: definition.version},
								);
	const isDeleteDisabled =
		!isDefinitionDeletionAvailable ||
		isIdentityPending ||
		isOperationRunning ||
		isAcceptedDeletionPending ||
		isCountPending ||
		isCountError ||
		isDrainingPending ||
		isDrainingError ||
		(runningInstancesCount ?? 0) > 0;

	return (
		<>
			<DeleteButtonContainer>
				{isOperationRunning && <InlineLoading />}
				{isDraining ? (
					<DrainingTag
						label={t('operate.dashboard.draining')}
						description={t('operate.dashboard.drainingDescriptionVersion')}
						align="left-top"
					/>
				) : (
					<>
						{isDeleted && (
							<Tooltip label={t('operate.processes.definitionDeletion.deletedDescription')} align="left-top" autoAlign>
								<Tag type="red" size="md" tabIndex={0}>
									{t('operate.processes.definitionDeletion.deleted')}
								</Tag>
							</Tooltip>
						)}
						<OperationItems>
							<DangerButton
								type="DELETE"
								title={buttonTitle}
								disabled={isDeleteDisabled}
								onClick={() => setIsDeleteModalVisible(true)}
							/>
						</OperationItems>
						{isDefinitionDeletionAvailable && isCountError && (
							<Button kind="ghost" size="sm" onClick={() => void refetchRunningInstancesCount()}>
								{t('operate.processes.definitionDeletion.retryCount')}
							</Button>
						)}
						{isDefinitionDeletionAvailable && isDrainingError && (
							<Button kind="ghost" size="sm" onClick={() => void refetchDraining()}>
								{t('operate.processes.definitionDeletion.retryStatus')}
							</Button>
						)}
						{isIdentityError && (
							<Button kind="ghost" size="sm" onClick={() => void refetchIdentity()}>
								{t('operate.processes.definitionDeletion.retryIdentity')}
							</Button>
						)}
						{isOperationStatusError && isAcceptedDeletionPending && (
							<Button kind="ghost" size="sm" onClick={() => void refetchAcceptedBatch()}>
								{t('operate.processes.definitionDeletion.retryOperationStatus')}
							</Button>
						)}
					</>
				)}
			</DeleteButtonContainer>
			<DeleteDefinitionModal
				isVisible={isDeleteModalVisible}
				title={t('operate.processes.definitionDeletion.title')}
				description={t(
					isDeleted
						? 'operate.processes.definitionDeletion.historyDescription'
						: 'operate.processes.definitionDeletion.description',
				)}
				confirmationText={t(
					isDeleted
						? 'operate.processes.definitionDeletion.historyConfirmation'
						: 'operate.processes.definitionDeletion.confirmation',
				)}
				warningTitle={t(
					isDeleted
						? 'operate.processes.definitionDeletion.historyWarningTitle'
						: 'operate.processes.definitionDeletion.warningTitle',
				)}
				warningContent={
					<Stack gap={6}>
						<UnorderedList nested>
							<ListItem>{t('operate.processes.definitionDeletion.warningFinishedInstances')}</ListItem>
							<ListItem>{t('operate.processes.definitionDeletion.warningReferencedInstances')}</ListItem>
							<ListItem>{t('operate.processes.definitionDeletion.warningUserTasks')}</ListItem>
						</UnorderedList>
						<Link
							href="https://docs.camunda.io/docs/components/operate/userguide/delete-resources/"
							target="_blank"
							rel="noreferrer"
						>
							{t('operate.processes.definitionDeletion.documentation')}
						</Link>
					</Stack>
				}
				bodyContent={
					<StructuredList
						label={t('operate.processes.definitionDeletion.details')}
						headerColumns={[{cellContent: t('operate.processes.definitionDeletion.definition')}]}
						rows={[
							{
								key: definition.processDefinitionKey,
								columns: [
									{
										cellContent: t('operate.processes.definitionDeletion.definitionVersion', {
											name,
											version: definition.version,
										}),
									},
								],
							},
						]}
					/>
				}
				onClose={() => setIsDeleteModalVisible(false)}
				onDelete={() => {
					setIsDeleteModalVisible(false);
					if (isDeleteDisabled || isDraining) {
						notificationsStore.displayNotification({
							kind: 'warning',
							title: t('operate.processes.definitionDeletion.staleSelection'),
							isDismissable: true,
						});
						return;
					}
					deleteDefinition(isDeleted ? 'history' : 'definition');
				}}
			/>
		</>
	);
};

export {ProcessOperations};
