/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {useState} from 'react';
import {createPortal} from 'react-dom';
import {useTranslation} from 'react-i18next';
import {useBlocker} from '@tanstack/react-router';
import {Button, Modal, Stack, Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@carbon/react';
import type {ProcessInstancesSelection} from './useProcessInstancesSelection';
import type {ProcessDefinitionSelection} from './DiagramPanel';
import {getProcessDefinitionName} from './getProcessDefinitionName';
import {BatchModificationActions} from './styled';
import {useBatchModificationStatistics} from './useBatchModificationStatistics';

type Props = {
	selection: ProcessInstancesSelection;
	processDefinitionSelection: ProcessDefinitionSelection;
	sourceElementId?: string;
	targetElementId?: string;
	sourceName?: string;
	targetName?: string;
	isSubmitting: boolean;
	isDefinitionAmbiguous?: boolean;
	onExit: () => void;
	onSubmit: () => void;
};

function BatchModificationFooter({
	selection,
	processDefinitionSelection,
	sourceElementId,
	targetElementId,
	sourceName,
	targetName,
	isSubmitting,
	isDefinitionAmbiguous,
	onExit,
	onSubmit,
}: Props) {
	const {t} = useTranslation();
	const [isExitOpen, setIsExitOpen] = useState(false);
	const [isReviewOpen, setIsReviewOpen] = useState(false);
	const blocker = useBlocker({
		shouldBlockFn: ({current, next}) => current.pathname !== next.pathname,
		withResolver: true,
	});
	const definitionKey =
		processDefinitionSelection.kind === 'single-version'
			? processDefinitionSelection.definition.processDefinitionKey
			: undefined;
	const processName =
		processDefinitionSelection.kind === 'no-match'
			? t('operate.processes.diagramHeader.title')
			: getProcessDefinitionName(processDefinitionSelection.definition);
	const {
		count,
		isError: isCountError,
		isUnavailable: isCountUnavailable,
		refetch: retryCount,
	} = useBatchModificationStatistics({
		definitionKey,
		sourceElementId,
		scope: {
			filter: selection.getRequest('cancel').filter,
			selectedCount: selection.selectedCount,
		},
	});
	const isExitConfirmationOpen = isExitOpen || blocker.status === 'blocked';
	const cancelExit = () => {
		blocker.reset?.();
		setIsExitOpen(false);
	};
	const canReview =
		selection.selectedCount > 0 &&
		selection.eligibility.cancel &&
		!isDefinitionAmbiguous &&
		sourceElementId !== undefined &&
		targetElementId !== undefined;

	return (
		<>
			<BatchModificationActions orientation="horizontal" gap={5}>
				<Button kind="secondary" size="sm" disabled={isSubmitting} onClick={() => setIsExitOpen(true)}>
					{t('operate.processes.batchModification.exit')}
				</Button>
				<Button
					size="sm"
					disabled={!canReview || isSubmitting}
					title={isDefinitionAmbiguous ? t('operate.processes.batchModification.selectTenant') : undefined}
					onClick={() => setIsReviewOpen(true)}
				>
					{t('operate.processes.batchModification.review')}
				</Button>
			</BatchModificationActions>
			{createPortal(
				<Modal
					open={isExitConfirmationOpen}
					modalHeading={t('operate.processes.batchModification.exitTitle')}
					preventCloseOnClickOutside
					primaryButtonText={t('operate.processes.batchModification.exit')}
					primaryButtonDisabled={isSubmitting}
					secondaryButtonText={t('operate.processes.batchModification.cancel')}
					danger={targetElementId !== undefined}
					onRequestClose={cancelExit}
					onSecondarySubmit={cancelExit}
					onRequestSubmit={() => {
						if (!isSubmitting) {
							onExit();
							blocker.proceed?.();
							setIsExitOpen(false);
						}
					}}
				>
					<Stack gap={3}>
						{targetElementId !== undefined && <p>{t('operate.processes.batchModification.discard')}</p>}
						<p>{t('operate.processes.batchModification.exitProceed')}</p>
					</Stack>
				</Modal>,
				document.getElementById('main-content') ?? document.body,
			)}
			{createPortal(
				<Modal
					open={isReviewOpen}
					modalHeading={t('operate.processes.batchModification.summaryTitle')}
					preventCloseOnClickOutside
					size="lg"
					primaryButtonText={t('operate.processes.batchModification.apply')}
					primaryButtonDisabled={!canReview || isSubmitting}
					secondaryButtonText={t('operate.processes.batchModification.cancel')}
					onRequestClose={() => setIsReviewOpen(false)}
					onSecondarySubmit={() => setIsReviewOpen(false)}
					onRequestSubmit={() => {
						if (canReview && !isSubmitting) {
							onSubmit();
						}
					}}
				>
					<p>{t('operate.processes.batchModification.summaryDescription', {processName})}</p>
					<h3>{t('operate.processes.batchModification.summaryHeading')}</h3>
					{isCountError && (
						<p role="alert">
							{t('operate.processes.batchModification.countError')}{' '}
							<Button kind="ghost" size="sm" onClick={() => void retryCount()}>
								{t('operate.processes.batchModification.retry')}
							</Button>
						</p>
					)}
					{isCountUnavailable && <p>{t('operate.processes.batchModification.countUnavailable')}</p>}
					<Table>
						<TableHead>
							<TableRow>
								<TableHeader>{t('operate.processes.batchModification.operation')}</TableHeader>
								<TableHeader>{t('operate.processes.batchModification.element')}</TableHeader>
								<TableHeader>{t('operate.processes.batchModification.affectedInstances')}</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							<TableRow>
								<TableCell>{t('operate.processes.batchModification.batchMove')}</TableCell>
								<TableCell>{`${sourceName ?? sourceElementId ?? ''} --> ${targetName ?? targetElementId ?? ''}`}</TableCell>
								<TableCell>
									{isCountUnavailable
										? '--'
										: count === undefined
											? t('operate.processes.batchModification.loadingCount')
											: count}
								</TableCell>
							</TableRow>
						</TableBody>
					</Table>
				</Modal>,
				document.getElementById('main-content') ?? document.body,
			)}
		</>
	);
}

export {BatchModificationFooter};
