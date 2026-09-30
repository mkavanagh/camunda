/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {describe, expect} from 'vitest';
import {it} from '#/vitest-modules/test-extend';
import {
	getConditionErrors,
	parseConditionsJson,
	serializeConditions,
	toVariableEntry,
	variableConditionsSchema,
	type VariableCondition,
} from './variableConditions';

describe('variable conditions', () => {
	it.for([
		{operator: 'equals', value: '42', expected: {$eq: '42'}},
		{operator: 'notEqual', value: '"open"', expected: {$neq: '"open"'}},
		{operator: 'contains', value: '{"partial"', expected: {$like: '*{"partial"*'}},
		{operator: 'oneOf', value: '42, true, hello', expected: {$in: ['42', 'true', '"hello"']}},
		{operator: 'oneOf', value: '["a","b"]', expected: {$in: ['"a"', '"b"']}},
		{operator: 'exists', value: '', expected: {$exists: true}},
		{operator: 'doesNotExist', value: '', expected: {$exists: false}},
	] as const)('should map $operator to the existing query API', ({operator, value, expected}) => {
		expect(toVariableEntry({name: 'status', operator, value})).toEqual({name: 'status', value: expected});
	});

	it.for([
		{condition: {name: '', operator: 'equals', value: '42'}, field: 'name', error: 'nameRequired'},
		{condition: {name: 'x', operator: 'equals', value: ' '}, field: 'value', error: 'valueRequired'},
		{condition: {name: 'x', operator: 'oneOf', value: '{broken'}, field: 'value', error: 'valueInvalid'},
		{condition: {name: 'x', operator: 'contains', value: '{broken'}, field: 'value', error: undefined},
		{condition: {name: 'x', operator: 'exists', value: ''}, field: 'value', error: undefined},
	] as const)('should validate $field for $condition.operator', ({condition, field, error}) => {
		expect(getConditionErrors(condition)[field]).toBe(error);
	});

	it('should discard malformed URL conditions atomically rather than sending a partial filter', () => {
		const valid: VariableCondition = {name: 'status', operator: 'equals', value: '"open"'};
		expect(variableConditionsSchema.parse([valid])).toEqual([valid]);
		expect(variableConditionsSchema.parse([valid, {name: 'unsafe', operator: 'unknown', value: 'x'}])).toBeUndefined();
		expect(variableConditionsSchema.parse([valid, {name: '', operator: 'exists', value: ''}])).toBeUndefined();
		expect(variableConditionsSchema.parse([])).toBeUndefined();
	});

	it('should round-trip all condition operators through the modal JSON editor', () => {
		const conditions: VariableCondition[] = [
			{name: 'status', operator: 'equals', value: '"open"'},
			{name: 'retry', operator: 'notEqual', value: '0'},
			{name: 'text', operator: 'contains', value: 'foo'},
			{name: 'region', operator: 'oneOf', value: '["eu","us"]'},
			{name: 'flag', operator: 'exists', value: ''},
			{name: 'missing', operator: 'doesNotExist', value: ''},
		];
		expect(parseConditionsJson(serializeConditions(conditions))).toEqual({ok: true, conditions});
	});

	it('should preserve numeric one-of values when switching between Fields and JSON', () => {
		const condition: VariableCondition = {name: 'counts', operator: 'oneOf', value: '1, 2'};
		const parsed = parseConditionsJson(serializeConditions([condition]));
		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.conditions.map(toVariableEntry)).toEqual([toVariableEntry(condition)]);
		}
	});

	it('should retain string versus number intent in imported JSON one-of values', () => {
		const text = (value: string) => `[{"name":"count","value":{"$in":[${value}]}}]`;
		const stringCondition = parseConditionsJson(text('"42"'));
		const numericCondition = parseConditionsJson(text('42'));
		expect(stringCondition.ok && stringCondition.conditions.map(toVariableEntry)).toEqual([
			{name: 'count', value: {$in: ['"42"']}},
		]);
		expect(numericCondition.ok && numericCondition.conditions.map(toVariableEntry)).toEqual([
			{name: 'count', value: {$in: ['42']}},
		]);
		expect(
			variableConditionsSchema.parse([{name: 'count', operator: 'oneOf', value: '["42"]'}])?.map(toVariableEntry),
		).toEqual([{name: 'count', value: {$in: ['"42"']}}]);
		expect(
			variableConditionsSchema.parse([{name: 'count', operator: 'oneOf', value: '[42]'}])?.map(toVariableEntry),
		).toEqual([{name: 'count', value: {$in: ['42']}}]);
	});

	it('should reject invalid JSON and unsupported operators without replacing conditions', () => {
		expect(parseConditionsJson('{broken')).toEqual({ok: false, error: 'invalidJson'});
		expect(parseConditionsJson('[{"name":"x","value":{"$notIn":["x"]}}]')).toEqual({
			ok: false,
			error: 'unsupportedOperator',
		});
		expect(parseConditionsJson('[{"name":"x","value":{"$eq":""}}]')).toEqual({
			ok: false,
			error: 'invalidConditions',
			details: [{row: 1, field: 'value'}],
		});
		expect(parseConditionsJson('[{"name":"","value":""},{"name":"x","value":""}]')).toEqual({
			ok: false,
			error: 'invalidConditions',
			details: [
				{row: 1, field: 'name'},
				{row: 1, field: 'value'},
				{row: 2, field: 'value'},
			],
		});
	});
});
