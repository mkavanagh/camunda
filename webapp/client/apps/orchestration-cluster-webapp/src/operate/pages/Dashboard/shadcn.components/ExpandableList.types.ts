/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import type React from 'react';

// TODO(#63423, #63424): delete once InstancesByProcess/IncidentsByError land in PR8
type ExpandableListRow = {
	id: string;
	content: React.ReactNode;
	name: React.ReactNode;
	activeCount?: number;
	incidentsCount: number;
};

// Resolved (translated) copy and a stable test id for one of the two "load
// more"/"load previous" skeleton-row indicators a variant renders inline in
// its table body while a page is being fetched. Resolved once in
// `ExpandableList` (which already owns the `useTranslation` call) rather than
// in every variant.
type ExpandableListLoadingIndicator = {
	testId: string;
	label: string;
};

type ExpandableListVariantProps = {
	header: string;
	rows: ExpandableListRow[];
	renderExpansion: (row: ExpandableListRow) => React.ReactNode;
	isPending: boolean;
	isFetchingNextPage: boolean;
	isFetchingPreviousPage: boolean;
	loadingNextPage: ExpandableListLoadingIndicator;
	loadingPreviousPage: ExpandableListLoadingIndicator;
};

type ExpandableListVariantComponent = React.FC<ExpandableListVariantProps>;

export type {ExpandableListRow, ExpandableListVariantProps, ExpandableListVariantComponent};
