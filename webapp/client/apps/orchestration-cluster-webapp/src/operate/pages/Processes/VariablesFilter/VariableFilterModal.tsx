/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
	Button,
	ContentSwitcher,
	Dropdown,
	IconButton,
	InlineNotification,
	Modal,
	Stack,
	Switch,
	TextInput,
} from '@carbon/react';
import {Add, Close, Maximize} from '@carbon/react/icons';
import {RichTextEditor, type EditorHandle} from '#/operate/shared/Editors/RichTextEditor';
import {CopyButton} from '#/operate/shared/CopyButton/CopyButton';
import {IconTextInput} from '#/operate/shared/IconInput/IconTextInput';
import {beautifyJSON} from '#/shared/json/beautifyJSON';
import {
	VARIABLE_OPERATORS,
	getConditionErrors,
	jsonConditionsSchemaForEditor,
	parseConditionsJson,
	serializeConditions,
	type VariableCondition,
	type VariableOperator,
} from './variableConditions';
import {ConditionRow, ConditionRows, ModalContent} from './styled';

type Props = {
	initialConditions: VariableCondition[];
	onApply: (conditions: VariableCondition[]) => void;
	onClose: () => void;
};

const EMPTY_CONDITION: VariableCondition = {name: '', operator: 'equals', value: ''};
const VALUELESS_OPERATORS: VariableOperator[] = ['exists', 'doesNotExist'];

const VariableFilterModal: React.FC<Props> = ({initialConditions, onApply, onClose}) => {
	const {t} = useTranslation();
	const [conditions, setConditions] = useState<VariableCondition[]>(
		initialConditions.length > 0 ? initialConditions : [{...EMPTY_CONDITION}],
	);
	const [hasSubmitted, setHasSubmitted] = useState(false);
	const [tab, setTab] = useState<'fields' | 'json'>('fields');
	const [jsonDraft, setJsonDraft] = useState('');
	const [jsonError, setJsonError] = useState<string>();
	const [jsonWarning, setJsonWarning] = useState(false);
	const [editingRow, setEditingRow] = useState<number>();
	const [editedValue, setEditedValue] = useState('');
	const [isEditorValid, setIsEditorValid] = useState(true);
	const editorRef = useRef<EditorHandle | null>(null);

	const updateCondition = (index: number, changes: Partial<VariableCondition>) => {
		setConditions((current) =>
			current.map((condition, position) => (position === index ? {...condition, ...changes} : condition)),
		);
	};
	const closeEditor = () => {
		setEditingRow(undefined);
		setIsEditorValid(true);
	};
	const applyFields = () => {
		setHasSubmitted(true);
		if (conditions.some((condition) => Object.keys(getConditionErrors(condition)).length > 0)) {
			return;
		}
		onApply(conditions);
	};
	const applyJson = () => {
		const result = parseConditionsJson(jsonDraft);
		if (!result.ok) {
			const message = t(`operate.processes.variableFilter.${result.error}`);
			setJsonError(
				!result.details?.length
					? message
					: `${message}: ${result.details
							.map(({row, field}) =>
								t('operate.processes.variableFilter.conditionLocation', {
									number: row,
									field: field ? t(`operate.processes.variableFilter.${field}`) : '',
								}),
							)
							.join('; ')}`,
			);
			editorRef.current?.showMarkers();
			return;
		}
		onApply(result.conditions);
	};
	const switchTab = (nextTab: 'fields' | 'json') => {
		if (nextTab === 'json') {
			if (!jsonWarning) {
				setJsonDraft(serializeConditions(conditions));
			}
			setJsonError(undefined);
			setJsonWarning(false);
		} else {
			const parsed = parseConditionsJson(jsonDraft);
			if (parsed.ok) {
				setConditions(parsed.conditions.length ? parsed.conditions : [{...EMPTY_CONDITION}]);
				setJsonWarning(false);
			} else {
				setJsonWarning(true);
			}
			setJsonError(undefined);
		}
		setTab(nextTab);
	};
	const operatorLabel = (operator: VariableOperator) => t(`operate.processes.variableFilter.operators.${operator}`);

	return (
		<Modal
			open
			modalHeading={
				editingRow === undefined
					? t('operate.processes.variableFilter.heading')
					: conditions[editingRow]?.name.trim()
						? t('operate.processes.variableFilter.editValueNamed', {name: conditions[editingRow]?.name.trim()})
						: t('operate.processes.variableFilter.editValue')
			}
			modalAriaLabel={t('operate.processes.variableFilter.heading')}
			primaryButtonText={t(
				editingRow === undefined ? 'operate.processes.variableFilter.apply' : 'operate.processes.variableFilter.save',
			)}
			secondaryButtonText={t('operate.processes.variableFilter.cancel')}
			closeButtonLabel={t('operate.processes.variableFilter.close')}
			onRequestSubmit={() => {
				if (editingRow !== undefined) {
					if (isEditorValid) {
						updateCondition(editingRow, {value: editedValue});
						closeEditor();
					} else {
						editorRef.current?.showMarkers();
					}
				} else if (tab === 'json') {
					applyJson();
				} else {
					applyFields();
				}
			}}
			onRequestClose={editingRow === undefined ? onClose : closeEditor}
			onSecondarySubmit={editingRow === undefined ? onClose : closeEditor}
			preventCloseOnClickOutside
			size="md"
		>
			<ModalContent>
				{editingRow === undefined ? (
					<Stack gap={5}>
						<p>{t('operate.processes.variableFilter.description')}</p>
						<ContentSwitcher
							size="sm"
							selectedIndex={tab === 'fields' ? 0 : 1}
							onChange={({index}) => switchTab(index === 0 ? 'fields' : 'json')}
						>
							<Switch name="fields" text={t('operate.processes.variableFilter.fields')} />
							<Switch name="json" text={t('operate.processes.variableFilter.json')} />
						</ContentSwitcher>
						{tab === 'fields' ? (
							<>
								{jsonWarning && (
									<InlineNotification
										kind="warning"
										lowContrast
										hideCloseButton
										role="status"
										subtitle={t('operate.processes.variableFilter.jsonWarning')}
									/>
								)}
								<ConditionRows>
									<Stack gap={4}>
										{conditions.map((condition, index) => {
											const errors = hasSubmitted ? getConditionErrors(condition) : {};
											return (
												<ConditionRow key={index}>
													<TextInput
														id={`variable-name-${index}`}
														labelText={t('operate.processes.variableFilter.name')}
														hideLabel
														placeholder={t('operate.processes.variableFilter.namePlaceholder')}
														value={condition.name}
														invalid={errors.name !== undefined}
														invalidText={errors.name && t(`operate.processes.variableFilter.${errors.name}`)}
														autoComplete="off"
														size="sm"
														onChange={(event) => updateCondition(index, {name: event.target.value})}
													/>
													<Dropdown
														id={`variable-operator-${index}`}
														titleText={t('operate.processes.variableFilter.operator')}
														hideLabel
														label={t('operate.processes.variableFilter.selectOperator')}
														items={[...VARIABLE_OPERATORS]}
														itemToString={(operator) => (operator ? operatorLabel(operator) : '')}
														selectedItem={condition.operator}
														onChange={({selectedItem}) => {
															if (selectedItem) {
																updateCondition(index, {
																	operator: selectedItem,
																	...(VALUELESS_OPERATORS.includes(selectedItem) ? {value: ''} : {}),
																});
															}
														}}
														size="sm"
														autoAlign
													/>
													<div>
														{!VALUELESS_OPERATORS.includes(condition.operator) && (
															<IconTextInput
																id={`variable-value-${index}`}
																labelText={t('operate.processes.variableFilter.value')}
																hideLabel
																placeholder={t(
																	condition.operator === 'contains'
																		? 'operate.processes.variableFilter.containsPlaceholder'
																		: condition.operator === 'oneOf'
																			? 'operate.processes.variableFilter.oneOfPlaceholder'
																			: 'operate.processes.variableFilter.valuePlaceholder',
																)}
																value={condition.value}
																invalid={errors.value !== undefined}
																invalidText={errors.value && t(`operate.processes.variableFilter.${errors.value}`)}
																size="sm"
																onChange={(event) => updateCondition(index, {value: event.target.value})}
																Icon={Maximize}
																buttonLabel={t('operate.processes.variableFilter.openEditor')}
																onIconClick={() => {
																	setEditingRow(index);
																	setEditedValue(beautifyJSON(condition.value));
																}}
															/>
														)}
													</div>
													<IconButton
														kind="ghost"
														size="sm"
														label={t('operate.processes.variableFilter.removeCondition')}
														disabled={conditions.length === 1}
														onClick={() =>
															setConditions((current) => current.filter((_, position) => position !== index))
														}
													>
														<Close />
													</IconButton>
												</ConditionRow>
											);
										})}
									</Stack>
								</ConditionRows>
								{conditions.some(({operator}) => operator === 'contains') && (
									<InlineNotification
										kind="warning"
										lowContrast
										hideCloseButton
										role="status"
										subtitle={t('operate.processes.variableFilter.containsWarning')}
									/>
								)}
								{conditions.length >= 8 && (
									<InlineNotification
										kind="info"
										lowContrast
										hideCloseButton
										role="status"
										subtitle={t('operate.processes.variableFilter.manyConditionsWarning')}
									/>
								)}
								<Button
									kind="ghost"
									size="sm"
									renderIcon={Add}
									onClick={() => setConditions((current) => [...current, {...EMPTY_CONDITION}])}
								>
									{t('operate.processes.variableFilter.addCondition')}
								</Button>
							</>
						) : (
							<>
								<CopyButton value={jsonDraft} />
								<RichTextEditor
									value={jsonDraft}
									jsonSchema={jsonConditionsSchemaForEditor}
									height="300px"
									isInvalid={jsonError !== undefined}
									options={{ariaLabel: t('operate.processes.variableFilter.json')}}
									onChange={(value) => {
										setJsonDraft(value);
										setJsonError(undefined);
									}}
									onMount={(editor) => {
										editorRef.current = editor;
									}}
								/>
								{jsonError && (
									<InlineNotification
										kind="error"
										lowContrast
										hideCloseButton
										role="alert"
										title={t('operate.processes.variableFilter.jsonError')}
										subtitle={jsonError}
									/>
								)}
							</>
						)}
					</Stack>
				) : (
					<Stack gap={4}>
						<CopyButton value={editedValue} />
						<RichTextEditor
							value={editedValue}
							height="45vh"
							options={{ariaLabel: t('operate.processes.variableFilter.value')}}
							onChange={setEditedValue}
							onValidate={setIsEditorValid}
							onMount={(editor) => {
								editorRef.current = editor;
							}}
						/>
					</Stack>
				)}
			</ModalContent>
		</Modal>
	);
};

export {VariableFilterModal};
