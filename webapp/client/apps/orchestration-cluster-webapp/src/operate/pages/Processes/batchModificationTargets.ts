/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import type {BusinessObject} from 'bpmn-js/lib/NavigatedViewer';

function isAttachedToEventBasedGateway(element: BusinessObject) {
	return element.incoming?.some((flow) => flow.sourceRef?.$type === 'bpmn:EventBasedGateway') ?? false;
}

function isMoveTarget(element: BusinessObject | undefined): element is BusinessObject {
	return (
		element !== undefined &&
		element.$type !== 'bpmn:StartEvent' &&
		element.$type !== 'bpmn:BoundaryEvent' &&
		!isAttachedToEventBasedGateway(element)
	);
}

function getMoveSourceRestriction(element: BusinessObject | undefined) {
	if (element === undefined) {
		return 'selectElement';
	}
	if (
		element.$type === 'bpmn:StartEvent' ||
		element.$type === 'bpmn:BoundaryEvent' ||
		element.loopCharacteristics?.$type === 'bpmn:MultiInstanceLoopCharacteristics'
	) {
		return 'unsupportedType';
	}
	if (element.$parent?.loopCharacteristics?.$type === 'bpmn:MultiInstanceLoopCharacteristics') {
		return 'insideMultiInstance';
	}
	return null;
}

export {isMoveTarget, getMoveSourceRestriction, isAttachedToEventBasedGateway};
