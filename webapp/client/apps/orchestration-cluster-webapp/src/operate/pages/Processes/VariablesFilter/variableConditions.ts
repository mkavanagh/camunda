/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {z} from 'zod';
import {
	processInstanceVariableFilterSchema,
	type QueryProcessInstancesRequestBody,
} from '@camunda/camunda-api-zod-schemas/8.11';

const VARIABLE_OPERATORS = ['equals', 'notEqual', 'contains', 'oneOf', 'exists', 'doesNotExist'] as const;
type VariableOperator = (typeof VARIABLE_OPERATORS)[number];
type VariableCondition = {name: string; operator: VariableOperator; value: string};
type VariableEntry = NonNullable<NonNullable<QueryProcessInstancesRequestBody['filter']>['variables']>[number];

function smartTransformValue(raw: string): unknown {
	const trimmed = raw
		.trim()
		.replace(/^,+|,+$/g, '')
		.trim();
	if (trimmed === '') {
		return '';
	}
	try {
		return JSON.parse(trimmed);
	} catch {
		if (trimmed.includes(',') && !/[{}[\]"]/.test(trimmed)) {
			return trimmed
				.split(',')
				.map((part) => part.trim())
				.filter(Boolean)
				.map((part) => {
					try {
						return JSON.parse(part);
					} catch {
						return part;
					}
				});
		}
		if (!/[{}[\]"]/.test(trimmed)) {
			return trimmed;
		}
		throw new Error(`Invalid value: ${raw}`);
	}
}

function getConditionErrors(condition: VariableCondition) {
	const errors: {name?: 'nameRequired'; value?: 'valueRequired' | 'valueInvalid'} = {};
	if (!condition.name.trim()) {
		errors.name = 'nameRequired';
	}
	if (condition.operator !== 'exists' && condition.operator !== 'doesNotExist') {
		if (!condition.value.trim()) {
			errors.value = 'valueRequired';
		} else if (condition.operator !== 'contains') {
			try {
				smartTransformValue(condition.value);
			} catch {
				errors.value = 'valueInvalid';
			}
		}
	}
	return errors;
}

const variableConditionSchema = z
	.object({
		name: z.string(),
		operator: z.enum(VARIABLE_OPERATORS),
		value: z.string(),
	})
	.strict()
	.refine((condition) => Object.keys(getConditionErrors(condition)).length === 0);

const variableConditionsSchema = z.array(variableConditionSchema).nonempty().optional().catch(undefined);

function toVariableEntry(condition: VariableCondition): VariableEntry {
	const {name, operator, value} = condition;
	if (operator === 'exists' || operator === 'doesNotExist') {
		return {name, value: {$exists: operator === 'exists'}};
	}
	if (operator === 'contains') {
		return {name, value: {$like: `*${value}*`}};
	}
	const parsed = smartTransformValue(value);
	if (operator === 'oneOf') {
		return {name, value: {$in: (Array.isArray(parsed) ? parsed : [parsed]).map((item) => JSON.stringify(item))}};
	}
	return operator === 'equals'
		? {name, value: {$eq: JSON.stringify(parsed)}}
		: {name, value: {$neq: JSON.stringify(parsed)}};
}

function serializeConditions(conditions: VariableCondition[]) {
	return JSON.stringify(
		conditions
			.filter(({name, value}) => name !== '' || value !== '')
			.map(({name, operator, value}) => {
				switch (operator) {
					case 'equals':
						return {name, value};
					case 'notEqual':
						return {name, value: {$neq: value}};
					case 'contains':
						return {name, value: {$like: `*${value}*`}};
					case 'oneOf': {
						try {
							const parsed = smartTransformValue(value);
							return {name, value: {$in: Array.isArray(parsed) ? parsed : [parsed]}};
						} catch {
							return {name, value: {$in: [value]}};
						}
					}
					case 'exists':
					case 'doesNotExist':
						return {name, value: {$exists: operator === 'exists'}};
				}
			}),
		null,
		2,
	);
}

const jsonConditionsSchema = z.array(
	processInstanceVariableFilterSchema.extend({
		value: z.union([processInstanceVariableFilterSchema.shape.value, z.object({$in: z.array(z.unknown())}).strict()]),
	}),
);
const jsonConditionsSchemaForEditor = z.toJSONSchema(
	z.array(jsonConditionsSchema.element.extend({name: z.string().min(1)})),
);

type JsonParseResult =
	| {ok: true; conditions: VariableCondition[]}
	| {
			ok: false;
			error: 'invalidJson' | 'invalidConditions' | 'unsupportedOperator';
			details?: Array<{row: number; field?: 'name' | 'value'}>;
	  };

function parseConditionsJson(text: string): JsonParseResult {
	let raw: unknown;
	try {
		raw = JSON.parse(text.trim() || '[]');
	} catch {
		return {ok: false, error: 'invalidJson'};
	}
	const result = jsonConditionsSchema.safeParse(raw);
	if (!result.success) {
		return {
			ok: false,
			error: 'invalidConditions',
			details: result.error.issues.map(({path}) => ({
				row: typeof path[0] === 'number' ? path[0] + 1 : 1,
				field: path[1] === 'name' || path[1] === 'value' ? path[1] : undefined,
			})),
		};
	}
	const conditions: VariableCondition[] = [];
	for (const {name, value} of result.data) {
		if (typeof value === 'string') {
			conditions.push({name, operator: 'equals', value});
		} else if ('$eq' in value) {
			conditions.push({name, operator: 'equals', value: value.$eq});
		} else if ('$neq' in value) {
			conditions.push({name, operator: 'notEqual', value: value.$neq});
		} else if ('$like' in value) {
			conditions.push({name, operator: 'contains', value: value.$like.replace(/^\*/, '').replace(/\*$/, '')});
		} else if ('$in' in value) {
			conditions.push({name, operator: 'oneOf', value: JSON.stringify(value.$in)});
		} else if ('$exists' in value) {
			conditions.push({name, operator: value.$exists ? 'exists' : 'doesNotExist', value: ''});
		} else {
			return {ok: false, error: 'unsupportedOperator'};
		}
	}
	const details = conditions.flatMap((condition, index) => {
		const errors = getConditionErrors(condition);
		return (['name', 'value'] as const).filter((field) => errors[field]).map((field) => ({row: index + 1, field}));
	});
	if (details.length) {
		return {ok: false, error: 'invalidConditions', details};
	}
	return {ok: true, conditions};
}

export {
	VARIABLE_OPERATORS,
	variableConditionsSchema,
	getConditionErrors,
	toVariableEntry,
	serializeConditions,
	parseConditionsJson,
	jsonConditionsSchemaForEditor,
};
export type {VariableCondition, VariableOperator};
