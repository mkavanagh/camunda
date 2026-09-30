/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

type Props = {
	testId: string;
	label: string;
};

const ExpandableListSkeletonRow: React.FC<Props> = ({testId, label}) => (
	// `relative` contains the `sr-only` live-region span below: Tailwind's
	// `sr-only` is always `position: absolute`, so without a positioned
	// ancestor right here it would escape this (clipped, 1px) box and
	// resolve against the document root instead, inflating the page's real
	// scrollHeight for as long as this row is mounted.
	<div className="relative flex items-center" data-testid={testId} role="status" aria-live="polite">
		<span className="sr-only">{label}</span>
		<div aria-hidden className="h-4 w-3/4 animate-pulse rounded bg-neutral-background-strong" />
	</div>
);

export {ExpandableListSkeletonRow};
