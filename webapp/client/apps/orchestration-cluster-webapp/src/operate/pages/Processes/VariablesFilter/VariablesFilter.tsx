/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Stack, TextInput} from '@carbon/react';
import {Add, Edit} from '@carbon/react/icons';
import {Title} from '#/operate/shared/FiltersPanel/styled';
import {getConditionErrors, type VariableCondition} from './variableConditions';
import {VariableFilterModal} from './VariableFilterModal';
import {ButtonRow, ConditionList} from './styled';

type Props = {
	conditions?: VariableCondition[];
	onChange: (conditions?: VariableCondition[]) => void;
};

const VariablesFilter: React.FC<Props> = ({conditions, onChange}) => {
	const {t} = useTranslation();
	const single = conditions?.length === 1 && conditions[0]?.operator === 'equals' ? conditions[0] : undefined;
	const [draft, setDraft] = useState({
		seedName: single?.name,
		seedValue: single?.value,
		name: single?.name ?? '',
		value: single?.value ?? '',
		hasValidated: false,
	});
	const [isModalOpen, setIsModalOpen] = useState(false);
	if (draft.seedName !== single?.name || draft.seedValue !== single?.value) {
		setDraft({
			seedName: single?.name,
			seedValue: single?.value,
			name: single?.name ?? '',
			value: single?.value ?? '',
			hasValidated: false,
		});
	}
	const {name, value, hasValidated} = draft;

	useEffect(() => {
		if (isModalOpen || (conditions?.length && !single)) {
			return;
		}
		const timer = window.setTimeout(() => {
			const isEmpty = !name.trim() && !value.trim();
			const errors = getConditionErrors({name, operator: 'equals', value});
			setDraft((current) => ({...current, hasValidated: !isEmpty}));
			if (isEmpty && conditions?.length) {
				onChange(undefined);
			} else if (
				!isEmpty &&
				!errors.name &&
				!errors.value &&
				(name.trim() !== single?.name || value !== single.value)
			) {
				onChange([{name: name.trim(), operator: 'equals', value}]);
			}
		}, 750);
		return () => window.clearTimeout(timer);
	}, [name, value, conditions, single, isModalOpen, onChange]);

	const errors =
		hasValidated && (name.trim() || value.trim()) ? getConditionErrors({name, operator: 'equals', value}) : {};
	const showInline = !conditions?.length || single !== undefined;
	const submitInline = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			const next = {name: name.trim(), operator: 'equals' as const, value};
			if (
				!Object.keys(getConditionErrors(next)).length &&
				(next.name !== single?.name || next.value !== single.value)
			) {
				onChange([next]);
			}
		}
	};
	const openModal = () => {
		const next = {name: name.trim(), operator: 'equals' as const, value};
		if (
			(!conditions?.length || single) &&
			!Object.keys(getConditionErrors(next)).length &&
			(next.name !== single?.name || next.value !== single.value)
		) {
			onChange([next]);
		}
		setIsModalOpen(true);
	};
	const modalConditions =
		showInline && (name.trim() || value.trim())
			? [{name: name.trim(), operator: 'equals' as const, value}]
			: (conditions ?? []);

	return (
		<>
			<Title>{t('operate.processes.variableFilter.title')}</Title>
			{showInline ? (
				<Stack gap={3}>
					<TextInput
						id="variable-inline-name"
						labelText={t('operate.processes.variableFilter.name')}
						placeholder={t('operate.processes.variableFilter.namePlaceholder')}
						value={name}
						size="sm"
						autoComplete="off"
						invalid={errors.name !== undefined}
						invalidText={errors.name && t('operate.processes.variableFilter.inlineNameRequired')}
						onChange={(event) => setDraft((current) => ({...current, name: event.target.value}))}
						onKeyDown={submitInline}
					/>
					<TextInput
						id="variable-inline-value"
						labelText={t('operate.processes.variableFilter.value')}
						placeholder={t('operate.processes.variableFilter.valuePlaceholder')}
						value={value}
						size="sm"
						autoComplete="off"
						invalid={errors.value !== undefined}
						invalidText={
							errors.value &&
							t(
								`operate.processes.variableFilter.${errors.value === 'valueRequired' ? 'inlineValueRequired' : 'valueInvalid'}`,
							)
						}
						onChange={(event) => setDraft((current) => ({...current, value: event.target.value}))}
						onKeyDown={submitInline}
					/>
					<ButtonRow>
						<Button kind="ghost" size="sm" renderIcon={Add} onClick={openModal}>
							{t('operate.processes.variableFilter.addCondition')}
						</Button>
					</ButtonRow>
				</Stack>
			) : (
				<>
					<ConditionList aria-label={t('operate.processes.variableFilter.activeConditions')}>
						{conditions?.map(({name: conditionName, operator, value: conditionValue}, index) => (
							<li key={index}>
								{conditionName} {t(`operate.processes.variableFilter.operators.${operator}`)}
								{operator !== 'exists' && operator !== 'doesNotExist'
									? ` ${conditionValue.length > 50 ? `${conditionValue.slice(0, 47)}...` : conditionValue}`
									: ''}
							</li>
						))}
					</ConditionList>
					<Button kind="ghost" size="sm" renderIcon={Edit} onClick={openModal}>
						{t('operate.processes.variableFilter.editConditions')}
					</Button>
				</>
			)}
			{isModalOpen && (
				<VariableFilterModal
					initialConditions={modalConditions}
					onApply={(next) => {
						onChange(next.length ? next : undefined);
						setIsModalOpen(false);
					}}
					onClose={() => setIsModalOpen(false)}
				/>
			)}
		</>
	);
};

export {VariablesFilter};
