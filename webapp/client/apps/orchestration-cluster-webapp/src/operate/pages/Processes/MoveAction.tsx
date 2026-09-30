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
import {Checkbox, Modal, Stack, TableBatchAction} from '@carbon/react';
import {Move} from '@carbon/react/icons';
import type {ProcessInstancesSelection} from './useProcessInstancesSelection';
import type {ProcessDefinitionSelection} from './DiagramPanel';
import type {ProcessesMode} from './ProcessesLayout';
import {useDiagramXml} from './useDiagramXml';
import {getMoveSourceRestriction, isAttachedToEventBasedGateway} from './batchModificationTargets';

const HELPER_STORAGE_KEY = 'hideMoveModificationHelperModal';

type Props = {
	mode: ProcessesMode;
	isDefinitionAmbiguous?: boolean;
	selection: ProcessInstancesSelection;
	processDefinitionSelection: ProcessDefinitionSelection;
	sourceElementId?: string;
	onEnter: () => void;
};

function MoveAction({
	mode,
	isDefinitionAmbiguous,
	selection,
	processDefinitionSelection,
	sourceElementId,
	onEnter,
}: Props) {
	const {t} = useTranslation();
	const [isHelperOpen, setIsHelperOpen] = useState(false);
	const definitionKey =
		processDefinitionSelection.kind === 'single-version'
			? processDefinitionSelection.definition.processDefinitionKey
			: undefined;
	const {data, isFetching, isError} = useDiagramXml(definitionKey);
	const source = sourceElementId === undefined ? undefined : data?.businessObjects[sourceElementId];
	const restriction = getMoveSourceRestriction(source);
	const isGatewayTarget = source !== undefined && isAttachedToEventBasedGateway(source);
	const disabledReason =
		mode !== 'list'
			? t('operate.processes.toolbar.actionMode')
			: isDefinitionAmbiguous
				? t('operate.processes.batchModification.selectTenant')
				: isFetching || isError || restriction === 'selectElement' || definitionKey === undefined
					? t('operate.processes.batchModification.selectElement')
					: restriction === 'unsupportedType'
						? t('operate.processes.batchModification.unsupportedType')
						: !selection.eligibility.cancel
							? t('operate.processes.batchModification.runningOnly')
							: restriction === 'insideMultiInstance'
								? t('operate.processes.batchModification.insideMultiInstance')
								: isGatewayTarget
									? t('operate.processes.batchModification.eventGateway')
									: undefined;

	return (
		<>
			<TableBatchAction
				renderIcon={Move}
				disabled={disabledReason !== undefined}
				title={disabledReason}
				onClick={() => {
					if (disabledReason !== undefined) {
						return;
					}
					if (localStorage.getItem(HELPER_STORAGE_KEY) === 'true') {
						onEnter();
					} else {
						setIsHelperOpen(true);
					}
				}}
			>
				{t('operate.processes.batchModification.move')}
			</TableBatchAction>
			{createPortal(
				<Modal
					open={isHelperOpen}
					preventCloseOnClickOutside
					modalHeading={t('operate.processes.batchModification.helperTitle')}
					primaryButtonText={t('operate.processes.batchModification.continue')}
					secondaryButtonText={t('operate.processes.batchModification.cancel')}
					onRequestClose={() => setIsHelperOpen(false)}
					onSecondarySubmit={() => setIsHelperOpen(false)}
					onRequestSubmit={() => {
						setIsHelperOpen(false);
						onEnter();
					}}
					size="md"
				>
					<Stack gap={5}>
						<p>{t('operate.processes.batchModification.helperDescription')}</p>
						<p>{t('operate.processes.batchModification.helperSelectTarget')}</p>
						<p>{t('operate.processes.batchModification.helperReview')}</p>
						<Checkbox
							id="hide-move-modification-helper"
							labelText={t('operate.processes.batchModification.hideHelper')}
							onChange={(_, {checked}) => localStorage.setItem(HELPER_STORAGE_KEY, String(checked))}
						/>
					</Stack>
				</Modal>,
				document.getElementById('main-content') ?? document.body,
			)}
		</>
	);
}

export {MoveAction};
