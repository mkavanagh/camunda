/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {useContext} from 'react';
import {createPortal} from 'react-dom';
import {useTranslation} from 'react-i18next';
import type {ProcessDefinition} from '@camunda/camunda-api-zod-schemas/8.11';
import {Diagram} from '#/operate/shared/Diagram';
import {DiagramShell} from '#/operate/shared/DiagramShell/DiagramShell';
import {DiagramOverlayContext} from '#/operate/shared/Diagram/DiagramOverlayContext';
import {StateOverlay, type ElementState} from '#/operate/shared/StateOverlay/StateOverlay';
import {DiagramHeader} from './DiagramHeader';
import {useDiagramXml} from './useDiagramXml';
import {useDiagramStatisticsOverlays} from './useDiagramStatisticsOverlays';
import {getStatisticsFilter} from './getStatisticsFilter';
import {getProcessDefinitionName} from './getProcessDefinitionName';
import {Section, Badge} from './styled';
import {isMoveTarget} from './batchModificationTargets';
import type {ProcessesMode} from './ProcessesLayout';
import {InlineNotification, Button, Dropdown} from '@carbon/react';
import {useBatchModificationStatistics, type BatchModificationScope} from './useBatchModificationStatistics';

type ProcessDefinitionSelection =
	| {kind: 'no-match'}
	| {kind: 'single-version'; definition: ProcessDefinition}
	| {kind: 'all-versions'; definition: Pick<ProcessDefinition, 'name' | 'processDefinitionId'>};

function isStatisticsPayload(
	payload: unknown,
): payload is {elementState: ElementState | 'completedEndEvents'; count?: number} {
	return (
		typeof payload === 'object' &&
		payload !== null &&
		'elementState' in payload &&
		(!('count' in payload) || typeof payload.count === 'number')
	);
}

function StatisticsOverlays({modificationCount}: {modificationCount?: number}) {
	const overlays = useContext(DiagramOverlayContext);

	return overlays.map(({container, payload, elementId, type}) => {
		if (type === 'batch-modification-source' || type === 'batch-modification-target') {
			return modificationCount === undefined
				? null
				: createPortal(
						<Badge>{type === 'batch-modification-source' ? `-${modificationCount}` : `+${modificationCount}`}</Badge>,
						container,
						elementId,
					);
		}
		if (!isStatisticsPayload(payload)) {
			return null;
		}

		return (
			<StateOverlay
				key={`${elementId}-${payload.elementState}`}
				testId={`state-overlay-${elementId}-${payload.elementState}`}
				state={payload.elementState}
				count={payload.count}
				container={container}
			/>
		);
	});
}

type Props = {
	processDefinitionSelection: ProcessDefinitionSelection;
	elementId?: string;
	onElementSelection: (elementId?: string) => void;
	mode?: ProcessesMode;
	modificationScope?: BatchModificationScope;
	selectedTargetElementId?: string;
	onTargetElementSelection?: (elementId?: string) => void;
	active: boolean;
	incidents: boolean;
	completed: boolean;
	canceled: boolean;
	suspended: boolean;
};

const DiagramPanel: React.FC<Props> = ({
	processDefinitionSelection,
	elementId,
	onElementSelection,
	mode = 'list',
	modificationScope,
	selectedTargetElementId,
	onTargetElementSelection,
	active,
	incidents,
	completed,
	canceled,
	suspended,
}) => {
	const {t} = useTranslation();
	const selectedDefinitionKey =
		processDefinitionSelection.kind === 'single-version'
			? processDefinitionSelection.definition.processDefinitionKey
			: undefined;
	const selectedDefinitionName =
		processDefinitionSelection.kind !== 'no-match'
			? getProcessDefinitionName(processDefinitionSelection.definition)
			: t('operate.processes.diagramHeader.title');

	const {
		data: diagramData,
		isFetching: isXmlFetching,
		isError: isXmlError,
		refetch: retryXml,
	} = useDiagramXml(selectedDefinitionKey);
	const isModificationMode = mode === 'batch-modification';
	const {count: modificationCount} = useBatchModificationStatistics({
		definitionKey: isModificationMode ? selectedDefinitionKey : undefined,
		sourceElementId: isModificationMode ? elementId : undefined,
		scope: isModificationMode ? modificationScope : undefined,
	});
	const modificationOverlays =
		isModificationMode &&
		elementId &&
		selectedTargetElementId &&
		modificationCount !== undefined &&
		modificationCount > 0
			? [
					{type: 'batch-modification-source', elementId, position: {top: -14, right: -7}},
					{type: 'batch-modification-target', elementId: selectedTargetElementId, position: {top: -14, right: -7}},
				]
			: [];
	const moveTargets =
		isModificationMode && !isXmlFetching && !isXmlError
			? diagramData?.selectableElements.filter(
					(id) => id !== elementId && isMoveTarget(diagramData.businessObjects[id]),
				)
			: undefined;

	const statisticsFilter = getStatisticsFilter({active, incidents, completed, canceled, suspended});
	const {data: overlaysData} = useDiagramStatisticsOverlays({
		processDefinitionKey: selectedDefinitionKey,
		filter: statisticsFilter ?? {},
		businessObjects: diagramData?.businessObjects,
		enabled: statisticsFilter !== undefined,
	});

	const getStatus = () => {
		if (isXmlFetching) {
			return 'loading';
		}
		if (isXmlError) {
			return 'error';
		}
		if (processDefinitionSelection.kind !== 'single-version' || diagramData?.xml === '') {
			return 'empty';
		}
		return 'content';
	};

	return (
		<Section aria-label="Diagram Panel">
			<DiagramHeader processDefinitionSelection={processDefinitionSelection} />
			<DiagramShell
				status={getStatus()}
				emptyMessage={
					processDefinitionSelection.kind === 'all-versions'
						? {
								message: t('operate.processes.diagramPanel.multipleVersionsSelected', {name: selectedDefinitionName}),
								additionalInfo: t('operate.processes.diagramPanel.selectSingleVersion'),
							}
						: processDefinitionSelection.kind === 'single-version'
							? {message: t('operate.processInstance.diagram.noDiagram')}
							: {
									message: t('operate.processes.diagramPanel.noProcessSelected'),
									additionalInfo: t('operate.processes.diagramPanel.selectProcessInFilters'),
								}
				}
			>
				{diagramData?.xml && (
					<Diagram
						key={selectedDefinitionKey}
						xml={diagramData.xml}
						selectedElementIds={
							isModificationMode
								? [elementId, selectedTargetElementId].filter((id): id is string => id !== undefined)
								: elementId
									? [elementId]
									: undefined
						}
						onElementSelection={
							isModificationMode
								? (id) => {
										if (id === undefined || moveTargets?.includes(id)) {
											onTargetElementSelection?.(id);
										}
									}
								: onElementSelection
						}
						overlaysData={[
							...(isModificationMode
								? (overlaysData?.filter(({payload}) => isStatisticsPayload(payload) && payload.count !== undefined) ??
									[])
								: (overlaysData ?? [])),
							...modificationOverlays,
						]}
						selectableElements={moveTargets ?? diagramData.selectableElements}
					>
						<StatisticsOverlays modificationCount={modificationCount} />
					</Diagram>
				)}
			</DiagramShell>
			{isModificationMode && moveTargets && (
				<Dropdown
					id="batch-modification-target"
					titleText={t('operate.processes.batchModification.targetLabel')}
					label={t('operate.processes.batchModification.selectTarget')}
					items={moveTargets}
					itemToString={(id) => (id ? (diagramData?.businessObjects[id]?.name ?? id) : '')}
					selectedItem={selectedTargetElementId ?? null}
					onChange={({selectedItem}) => onTargetElementSelection?.(selectedItem ?? undefined)}
					size="sm"
				/>
			)}
			{isModificationMode && isXmlError && (
				<Button kind="ghost" size="sm" onClick={() => void retryXml()}>
					{t('operate.processes.batchModification.retryDiagram')}
				</Button>
			)}
			{isModificationMode && (
				<div>
					<InlineNotification
						hideCloseButton
						lowContrast
						kind="info"
						title=""
						subtitle={
							selectedTargetElementId
								? t('operate.processes.batchModification.targetScheduled', {
										source: diagramData?.businessObjects[elementId ?? '']?.name ?? elementId,
										target: diagramData?.businessObjects[selectedTargetElementId]?.name ?? selectedTargetElementId,
									})
								: t('operate.processes.batchModification.selectTarget')
						}
					/>
					{selectedTargetElementId && (
						<Button kind="ghost" size="sm" onClick={() => onTargetElementSelection?.(undefined)}>
							{t('operate.processes.batchModification.undo')}
						</Button>
					)}
				</div>
			)}
		</Section>
	);
};

export {DiagramPanel};
export type {ProcessDefinitionSelection};
